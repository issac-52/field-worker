package com.meter.fieldwork.settlement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.inspection.InspectionRules.Phase;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SettlementService {
  private final NamedParameterJdbcTemplate db;
  private final ObjectMapper json;

  public SettlementService(NamedParameterJdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  public record Rule(Phase phase, LocalDate startDate, LocalDate endDate, Long amount) {}

  public record Filter(
      String middleBlockId,
      String smallBlockId,
      Long workerId,
      Phase phase,
      LocalDate startDate,
      LocalDate endDate) {}

  public record Adjustment(
      Phase phase,
      LocalDate startDate,
      LocalDate endDate,
      Long amount,
      String middleBlockId,
      String smallBlockId,
      String reason) {}

  private void amount(Long value) {
    if (value == null || value < 0 || value > 9007199254740991L)
      throw new IllegalArgumentException();
  }

  private void range(LocalDate start, LocalDate end) {
    if (start == null || end == null || end.isBefore(start)) throw new IllegalArgumentException();
  }

  private void lock() {
    db.getJdbcTemplate().execute("select pg_advisory_xact_lock(74012026)");
  }

  public List<Map<String, Object>> rules() {
    return db.queryForList(
        "select id,phase,start_date as \"startDate\",end_date as \"endDate\",amount,created_at as"
            + " \"createdAt\" from fee_rules order by phase,start_date",
        Map.of());
  }

  @Transactional
  public Map<String, Object> add(Rule rule) {
    if (rule.phase() == null) throw new IllegalArgumentException();
    amount(rule.amount());
    range(rule.startDate(), rule.endDate());
    lock();
    Long id =
        db.getJdbcTemplate()
            .queryForObject(
                "insert into fee_rules(phase,start_date,end_date,amount) values(?,?,?,?) returning"
                    + " id",
                Long.class,
                rule.phase().name(),
                rule.startDate(),
                rule.endDate(),
                rule.amount());
    return rules().stream().filter(r -> r.get("id").equals(id)).findFirst().orElseThrow();
  }

  @Transactional
  public Map<String, Object> changeRate(long id, Long amount) {
    amount(amount);
    lock();
    if (db.update(
            "update fee_rules set amount=:amount where id=:id", Map.of("amount", amount, "id", id))
        != 1) throw new ApiException(404, "RULE_NOT_FOUND", "단가 규칙을 찾을 수 없습니다.");
    return rules().stream().filter(r -> r.get("id").equals(id)).findFirst().orElseThrow();
  }

  private static final String JOIN =
      " from inspections i join worksites s on s.id=i.site_id join users u on u.id=i.worker_id left"
          + " join settlement_records r on r.inspection_id=i.id ";

  private String where(Filter f, Map<String, Object> p) {
    StringBuilder w = new StringBuilder("true");
    if (f.startDate() != null && f.endDate() != null && f.endDate().isBefore(f.startDate()))
      throw new IllegalArgumentException();
    if (f.middleBlockId() != null) {
      w.append(" and s.middle_block=:middle");
      p.put("middle", f.middleBlockId());
    }
    if (f.smallBlockId() != null) {
      w.append(" and s.small_block=:small");
      p.put("small", f.smallBlockId());
    }
    if (f.workerId() != null) {
      w.append(" and i.worker_id=:worker");
      p.put("worker", f.workerId());
    }
    if (f.phase() != null) {
      w.append(" and i.phase=:phase");
      p.put("phase", f.phase().name());
    }
    if (f.startDate() != null) {
      w.append(" and coalesce(r.snapshot_date,i.inspection_date)>=:start");
      p.put("start", f.startDate());
    }
    if (f.endDate() != null) {
      w.append(" and coalesce(r.snapshot_date,i.inspection_date)<=:end");
      p.put("end", f.endDate());
    }
    return w.toString();
  }

  public Map<String, Object> page(Filter f, int requestedPage, int size, boolean money) {
    if (requestedPage < 1 || size < 1 || size > 100) throw new IllegalArgumentException();
    var p = new HashMap<String, Object>();
    String w = where(f, p);
    long total = db.queryForObject("select count(*)" + JOIN + "where " + w, p, Long.class),
        pages = Math.max(1, (total + size - 1) / size);
    int page = (int) Math.min(requestedPage, pages);
    p.put("limit", size);
    p.put("offset", (page - 1) * size);
    var rows =
        db.queryForList(
            "select i.id as \"inspectionId\",s.id as \"siteId\",s.management_number as"
                + " \"managementNo\",s.small_block as zone,i.phase,i.worker_id as"
                + " \"workerId\",u.nickname as"
                + " \"workerName\",coalesce(r.snapshot_date,i.inspection_date) as"
                + " date,coalesce(r.fee,i.fee) as fee,i.settlement_status as \"settlementStatus\""
                + JOIN
                + "where "
                + w
                + " order by coalesce(r.snapshot_date,i.inspection_date) desc,i.id limit :limit"
                + " offset :offset",
            p);
    var workers =
        db.queryForList(
            "select i.worker_id as \"workerId\",count(*) as count,sum(coalesce(r.fee,i.fee)) as fee"
                + JOIN
                + "where "
                + w
                + " group by i.worker_id",
            p);
    var summary = new LinkedHashMap<String, Object>();
    summary.put("count", total);
    if (money)
      summary.put(
          "totalFee",
          db.queryForObject(
              "select coalesce(sum(coalesce(r.fee,i.fee)),0)" + JOIN + "where " + w,
              p,
              java.math.BigDecimal.class));
    else {
      rows.forEach(row -> row.remove("fee"));
      workers.forEach(row -> row.remove("fee"));
    }
    summary.put("workers", workers);
    return Map.of(
        "items",
        rows,
        "page",
        page,
        "pageSize",
        size,
        "total",
        total,
        "totalPages",
        pages,
        "summary",
        summary);
  }

  public Map<String, Object> preview(Adjustment a) {
    validate(a, false);
    var rows = targets(a);
    java.math.BigDecimal before =
        rows.stream()
            .map(r -> new java.math.BigDecimal(r.get("fee").toString()))
            .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
    return Map.of(
        "targetCount",
        rows.size(),
        "beforeTotal",
        before,
        "afterTotal",
        java.math.BigDecimal.valueOf(a.amount())
            .multiply(java.math.BigDecimal.valueOf(rows.size())));
  }

  @Transactional
  public Map<String, Object> adjust(Adjustment a, long actor) {
    validate(a, true);
    lock();
    var rows = targets(a);
    UUID id = UUID.randomUUID();
    java.math.BigDecimal before =
        rows.stream()
            .map(r -> new java.math.BigDecimal(r.get("fee").toString()))
            .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
    var result =
        Map.<String, Object>of(
            "updatedCount",
            rows.size(),
            "amount",
            a.amount(),
            "beforeTotal",
            before,
            "afterTotal",
            java.math.BigDecimal.valueOf(a.amount())
                .multiply(java.math.BigDecimal.valueOf(rows.size())),
            "auditId",
            id,
            "changedAt",
            Instant.now());
    db.update(
        "insert into fee_adjustments(id,actor_id,request,result)"
            + " values(:id,:actor,:request::jsonb,:result::jsonb)",
        Map.of("id", id, "actor", actor, "request", json(a), "result", json(result)));
    for (var row : rows) {
      db.update(
          "insert into fee_adjustment_items(adjustment_id,inspection_id,before_fee,after_fee)"
              + " values(:audit,:id,:before,:after)",
          Map.of("audit", id, "id", row.get("id"), "before", row.get("fee"), "after", a.amount()));
      db.update(
          "update inspections set fee=:fee where id=:id",
          Map.of("fee", a.amount(), "id", row.get("id")));
    }
    return result;
  }

  private void validate(Adjustment a, boolean reason) {
    if (a.phase() == null
        || (reason && (a.reason() == null || a.reason().isBlank() || a.reason().length() > 2000)))
      throw new IllegalArgumentException();
    range(a.startDate(), a.endDate());
    amount(a.amount());
  }

  private List<Map<String, Object>> targets(Adjustment a) {
    var p = new HashMap<String, Object>();
    String w =
        where(
            new Filter(
                a.middleBlockId(), a.smallBlockId(), null, a.phase(), a.startDate(), a.endDate()),
            p);
    return db.queryForList(
        "select i.id,i.fee" + JOIN + "where " + w + " and i.settlement_status='OPEN' order by i.id",
        p);
  }

  public List<Object> history() {
    return db
        .queryForList(
            "select jsonb_build_object('request',request,'result',result,'actorId',actor_id)::text"
                + " from fee_adjustments order by created_at desc limit 100",
            Map.of(),
            String.class)
        .stream()
        .map(
            value -> {
              try {
                return (Object) json.readTree(value);
              } catch (Exception ex) {
                throw new IllegalStateException(ex);
              }
            })
        .toList();
  }

  @Transactional
  public Map<String, Object> transition(List<Long> ids, long actor, boolean pay) {
    if (ids == null
        || ids.isEmpty()
        || ids.size() > 1000
        || ids.contains(null)
        || new HashSet<>(ids).size() != ids.size()) throw new IllegalArgumentException();
    lock();
    var p = Map.<String, Object>of("ids", ids, "actor", actor);
    var rows =
        db.queryForList(
            "select id,settlement_status from inspections where id in (:ids) order by id for"
                + " update",
            p);
    if (rows.size() != ids.size()
        || rows.stream()
            .anyMatch(r -> !r.get("settlement_status").equals(pay ? "CONFIRMED" : "OPEN")))
      throw new ApiException(409, "INVALID_SETTLEMENT_STATE", "정산 상태가 변경되었거나 요청 상태와 다릅니다.");
    if (pay)
      db.update(
          "update settlement_records set paid_by=:actor,paid_at=now() where inspection_id in"
              + " (:ids)",
          p);
    else
      db.update(
          "insert into settlement_records(inspection_id,worker_id,snapshot_date,fee,confirmed_by)"
              + " select id,worker_id,inspection_date,fee,:actor from inspections where id in"
              + " (:ids)",
          p);
    var update = new HashMap<String, Object>(p);
    update.put("state", pay ? "PAID" : "CONFIRMED");
    db.update("update inspections set settlement_status=:state where id in (:ids)", update);
    return Map.of("updatedCount", ids.size(), "status", pay ? "PAID" : "CONFIRMED");
  }

  private String json(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }
}
