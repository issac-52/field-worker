package com.meter.fieldwork.geocoding;

import com.meter.fieldwork.worksite.WorksiteService;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class GeocodingService {
  private final JdbcTemplate db;
  private final AddressGeocoder geocoder;
  private final WorksiteService sites;

  public GeocodingService(JdbcTemplate db, AddressGeocoder geocoder, WorksiteService sites) {
    this.db = db;
    this.geocoder = geocoder;
    this.sites = sites;
  }

  public record Request(long afterId, Long throughId, String region) {}

  public record Row(long id, String consumerNumber, String status) {}

  public record Result(long nextId, long throughId, boolean done, List<Row> rows) {}

  public Result run(Request request, long actor) {
    if (request.afterId() < 0
        || request.region() == null
        || request.region().strip().length() < 2
        || request.region().length() > 100)
      throw new IllegalArgumentException("시·군·구를 포함한 주소 지역명을 입력하세요.");
    long limit =
        request.throughId() == null
            ? db.queryForObject("select coalesce(max(id),0) from worksites", Long.class)
            : request.throughId();
    if (limit < 0 || request.afterId() > limit) throw new IllegalArgumentException();
    var candidates =
        db.queryForList(
            "select id,consumer_number,address,old_address from worksites where id>? and id<=? and"
                + " (latitude is null or longitude is null) order by id limit 5",
            request.afterId(),
            limit);
    var result = new ArrayList<Row>();
    long cursor = request.afterId();
    for (var row : candidates) {
      long id = ((Number) row.get("id")).longValue();
      String raw = Objects.toString(row.get("address"), "").strip();
      if (raw.isBlank()) raw = Objects.toString(row.get("old_address"), "").strip();
      String status = "EMPTY_ADDRESS";
      if (!raw.isBlank()) {
        String region = request.region().strip();
        var match = geocoder.find(raw.startsWith(region) ? raw : region + " " + raw);
        status =
            match == null
                ? "NO_UNIQUE_MATCH"
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
      result.add(new Row(id, Objects.toString(row.get("consumer_number")), status));
      cursor = id;
    }
    boolean done =
        db.queryForObject(
                "select count(*) from worksites where id>? and id<=? and (latitude is null or"
                    + " longitude is null)",
                Long.class,
                cursor,
                limit)
            == 0;
    return new Result(cursor, limit, done, List.copyOf(result));
  }
}
