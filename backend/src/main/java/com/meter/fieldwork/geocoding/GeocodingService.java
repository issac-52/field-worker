package com.meter.fieldwork.geocoding;

import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.worksite.WorksiteService;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class GeocodingService {
  private final NamedParameterJdbcTemplate db;
  private final AddressGeocoder geocoder;
  private final WorksiteService sites;
  private final ReentrantLock batchLock = new ReentrantLock();

  public GeocodingService(JdbcTemplate db, AddressGeocoder geocoder, WorksiteService sites) {
    this.db = new NamedParameterJdbcTemplate(db);
    this.geocoder = geocoder;
    this.sites = sites;
  }

  public record Request(
      long afterId,
      Long throughId,
      String region,
      String middleBlock,
      LocalDate registeredFrom,
      LocalDate registeredTo) {}

  public record Row(
      long id, String consumerNumber, String status, String errorCode, String errorMessage) {
    public Row(long id, String number, String status) {
      this(id, number, status, null, null);
    }
  }

  public record Result(
      long nextId,
      long throughId,
      boolean done,
      List<Row> rows,
      String errorCode,
      String errorMessage) {}

  public Result run(Request request, long actor) {
    if (!batchLock.tryLock())
      throw new ApiException(409, "GEOCODING_BUSY", "다른 주소 변환이 진행 중입니다. 잠시 후 다시 실행하세요.");
    long started = System.nanoTime();
    var log = org.slf4j.LoggerFactory.getLogger(GeocodingService.class);
    log.info("Geocoding batch started");
    try {
      var result = batch(request, actor);
      log.info(
          "Geocoding batch finished rows={} updated={} errorCode={} elapsedMs={}",
          result.rows().size(),
          result.rows().stream().filter(row -> row.status().equals("UPDATED")).count(),
          result.errorCode(),
          TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
      return result;
    } catch (RuntimeException ex) {
      log.warn(
          "Geocoding batch failed errorType={} elapsedMs={}",
          ex.getClass().getSimpleName(),
          TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
      throw ex;
    } finally {
      batchLock.unlock();
    }
  }

  private Result batch(Request request, long actor) {
    if (request.afterId() < 0
        || request.region() == null
        || request.region().strip().length() < 2
        || request.region().length() > 100)
      throw new IllegalArgumentException("시·군·구를 포함한 주소 지역명을 입력하세요.");
    String block = Objects.toString(request.middleBlock(), "").strip();
    if (block.isEmpty() && request.registeredFrom() == null && request.registeredTo() == null)
      throw new IllegalArgumentException("중블록 또는 최초 등록일을 선택하세요.");
    if (block.length() > 200
        || (request.registeredFrom() != null
            && request.registeredTo() != null
            && request.registeredFrom().isAfter(request.registeredTo())))
      throw new IllegalArgumentException("중블록 및 등록일 범위를 확인하세요.");
    var params = new HashMap<String, Object>();
    String filter = " (latitude is null or longitude is null)";
    if (!block.isEmpty()) {
      filter += " and middle_block=:block";
      params.put("block", block);
    }
    ZoneId zone = ZoneId.of("Asia/Seoul");
    if (request.registeredFrom() != null) {
      filter += " and created_at>=:from";
      params.put("from", request.registeredFrom().atStartOfDay(zone).toOffsetDateTime());
    }
    if (request.registeredTo() != null) {
      filter += " and created_at<:to";
      params.put("to", request.registeredTo().plusDays(1).atStartOfDay(zone).toOffsetDateTime());
    }
    long limit =
        request.throughId() == null
            ? db.queryForObject(
                "select coalesce(max(id),0) from worksites where " + filter, params, Long.class)
            : request.throughId();
    if (limit < 0 || request.afterId() > limit) throw new IllegalArgumentException();
    params.put("after", request.afterId());
    params.put("through", limit);
    String where = " where id>:after and id<=:through and " + filter;
    var candidates =
        db.queryForList(
            "select id,consumer_number,address,old_address from worksites"
                + where
                + " order by id limit 100",
            params);
    var result = new ArrayList<Row>();
    // Bound provider concurrency and return early on slow batches, keeping the cursor contiguous.
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
    try (var executor = Executors.newFixedThreadPool(10)) {
      for (int start = 0; start < candidates.size(); start += 10) {
        if (start > 0 && System.nanoTime() >= deadline) break;
        var pending = new ArrayList<CompletableFuture<Row>>();
        for (var row : candidates.subList(start, Math.min(start + 10, candidates.size())))
          pending.add(
              CompletableFuture.supplyAsync(
                  () -> convert(row, request.region().strip(), actor), executor));
        for (var future : pending) {
          try {
            result.add(future.join());
          } catch (CompletionException ex) {
            if (ex.getCause() instanceof RuntimeException cause) throw cause;
            throw ex;
          }
        }
        if (result.stream().anyMatch(row -> row.errorCode() != null)) break;
      }
    }
    long cursor = result.isEmpty() ? request.afterId() : result.getLast().id();
    params.put("after", cursor);
    boolean done =
        db.queryForObject("select count(*) from worksites" + where, params, Long.class) == 0;
    var failure = result.stream().filter(row -> row.errorCode() != null).findFirst().orElse(null);
    return new Result(
        cursor,
        limit,
        done && failure == null,
        List.copyOf(result),
        failure == null ? null : failure.errorCode(),
        failure == null ? null : failure.errorMessage());
  }

  private Row convert(Map<String, Object> row, String region, long actor) {
    long id = ((Number) row.get("id")).longValue();
    String raw = Objects.toString(row.get("address"), "").strip();
    if (raw.isBlank()) raw = Objects.toString(row.get("old_address"), "").strip();
    String status = "EMPTY_ADDRESS";
    if (!raw.isBlank()) {
      AddressGeocoder.Match match;
      try {
        match = geocoder.find(raw.startsWith(region) ? raw : region + " " + raw);
      } catch (ApiException ex) {
        return new Row(
            id,
            Objects.toString(row.get("consumer_number")),
            "SERVICE_ERROR",
            ex.code,
            ex.getMessage());
      }
      status =
          match == null
              ? "NO_MATCH"
              : sites.saveCoordinates(
                      id,
                      actor,
                      Objects.toString(row.get("address"), ""),
                      Objects.toString(row.get("old_address"), ""),
                      match.latitude(),
                      match.longitude())
                  ? "UPDATED"
                  : "CHANGED_OR_ALREADY_SET";
    }
    return new Row(id, Objects.toString(row.get("consumer_number")), status);
  }
}
