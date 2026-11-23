package com.meter.fieldwork.inspection;

import static com.meter.fieldwork.inspection.InspectionRules.Phase;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InspectionService {
  private final JdbcTemplate db;
  private final ObjectMapper json;

  public InspectionService(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  @Transactional
  public void record(
      long site,
      Phase phase,
      LocalDate date,
      BigDecimal reading,
      Long worker,
      long actor,
      boolean admin) {
    InspectionRules.validate(phase, date, reading);
    if (worker == null) throw new IllegalArgumentException();
    if (!admin && worker != actor) throw forbidden();
    lockLedgerAndSite(site);
    if (db.queryForObject(
            "select count(*) from users where id=? and role='WORKER' and is_active",
            Integer.class,
            worker)
        != 1) throw new IllegalArgumentException("Inactive worker");
    if (db.queryForObject(
            "select count(*) from inspections where site_id=? and phase=?",
            Integer.class,
            site,
            phase.name())
        != 0) throw new ApiException(409, "ALREADY_RECORDED", "이미 등록된 단계입니다.");
    pair(site, phase, reading);
    var rates =
        db.queryForList(
            "select amount from fee_rules where phase=? and start_date<=? and end_date>=?",
            Long.class,
            phase.name(),
            date,
            date);
    if (rates.size() > 1) throw new IllegalStateException("Overlapping fee rules");
    long fee = rates.isEmpty() ? 0 : rates.getFirst();
    db.update(
        "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee)"
            + " values(?,?,?,?,?,?)",
        site,
        phase.name(),
        date,
        reading,
        worker,
        fee);
    audit(site, phase, actor, null, current(site, phase));
  }

  @Transactional
  public void correct(
      long site,
      Phase phase,
      LocalDate date,
      BigDecimal reading,
      Instant expected,
      long actor,
      boolean admin) {
    InspectionRules.validate(phase, date, reading);
    if (expected == null) throw new IllegalArgumentException();
    lockLedgerAndSite(site);
    var before = current(site, phase);
    if (!admin && ((Number) before.get("worker_id")).longValue() != actor) throw forbidden();
    if (!((java.sql.Timestamp) before.get("updated_at")).toInstant().equals(expected))
      throw new ApiException(409, "STALE_MEASUREMENT", "다른 수정이 반영되었습니다. 다시 조회하세요.");
    pair(site, phase, reading);
    // A reading/date correction never recalculates the original fee snapshot or changes its worker.
    db.update(
        "update inspections set"
            + " inspection_date=?,reading=?,updated_at=greatest(clock_timestamp(),updated_at+interval"
            + " '1 microsecond') where site_id=? and phase=?",
        date,
        reading,
        site,
        phase.name());
    audit(site, phase, actor, before, current(site, phase));
  }

  private void lockLedgerAndSite(long site) {
    db.execute("select pg_advisory_xact_lock(74012026)");
    if (db.queryForList("select id from worksites where id=? for update", site).isEmpty())
      throw new ApiException(404, "SITE_NOT_FOUND", "수용가를 찾을 수 없습니다.");
  }

  @Transactional(readOnly = true)
  public Map<String, Object> history(
      long site, Phase phase, Long beforeId, long actor, boolean admin) {
    var latest = current(site, phase);
    if (!admin && ((Number) latest.get("worker_id")).longValue() != actor) throw forbidden();
    if (beforeId != null && beforeId < 1) throw new IllegalArgumentException();
    var rows =
        db.queryForList(
            "select id,actor_id,changed_at,before_value::text,after_value::text from"
                + " inspection_edits where site_id=? and phase=? and id<? order by id desc limit"
                + " 100",
            site,
            phase.name(),
            beforeId == null ? Long.MAX_VALUE : beforeId);
    var items = new java.util.ArrayList<Map<String, Object>>();
    for (var row : rows) {
      try {
        var before =
            row.get("before_value") == null
                ? json.nullNode()
                : json.readTree((String) row.get("before_value"));
        var after = json.readTree((String) row.get("after_value"));
        if (!admin) {
          if (before.isObject())
            ((com.fasterxml.jackson.databind.node.ObjectNode) before).remove("fee");
          ((com.fasterxml.jackson.databind.node.ObjectNode) after).remove("fee");
        }
        items.add(
            Map.of(
                "id",
                row.get("id"),
                "actorId",
                row.get("actor_id"),
                "changedAt",
                ((java.sql.Timestamp) row.get("changed_at")).toInstant(),
                "before",
                before,
                "after",
                after));
      } catch (JsonProcessingException ex) {
        throw new IllegalStateException(ex);
      }
    }
    var result = new java.util.LinkedHashMap<String, Object>();
    result.put("items", items);
    result.put("nextCursor", rows.size() == 100 ? rows.getLast().get("id") : null);
    return result;
  }

  private void pair(long site, Phase phase, BigDecimal reading) {
    var other =
        db.queryForList(
            "select reading from inspections where site_id=? and phase=?",
            BigDecimal.class,
            site,
            phase == Phase.START ? "END" : "START");
    if (!other.isEmpty())
      InspectionRules.usage(
          phase == Phase.START ? reading : other.getFirst(),
          phase == Phase.END ? reading : other.getFirst());
  }

  private Map<String, Object> current(long site, Phase phase) {
    var rows =
        db.queryForList(
            "select * from inspections where site_id=? and phase=?", site, phase.name());
    if (rows.isEmpty()) throw new ApiException(404, "INSPECTION_NOT_FOUND", "검침을 찾을 수 없습니다.");
    return rows.getFirst();
  }

  private void audit(
      long site, Phase phase, long actor, Map<String, Object> before, Map<String, Object> after) {
    try {
      db.update(
          "insert into inspection_edits(site_id,phase,actor_id,before_value,after_value)"
              + " values(?,?,?,?::jsonb,?::jsonb)",
          site,
          phase.name(),
          actor,
          before == null ? null : json.writeValueAsString(before),
          json.writeValueAsString(after));
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private static ApiException forbidden() {
    return new ApiException(403, "FORBIDDEN", "본인 검침만 등록·수정할 수 있습니다.");
  }
}
