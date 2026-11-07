package com.meter.fieldwork.worksite;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiException;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class WorksiteService {
  private final NamedParameterJdbcTemplate db;
  private final ObjectMapper json;

  public WorksiteService(NamedParameterJdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  public record Filter(String middleBlockId, String smallBlockId, String q, String status) {}

  public Map<String, Object> page(Filter filter, int requestedPage, int size, boolean admin) {
    if (requestedPage < 1 || size < 1 || size > 100) throw new IllegalArgumentException();
    var params = new HashMap<String, Object>();
    String where = where(filter, params);
    long total =
        db.queryForObject("select count(*) from worksites s where " + where, params, Long.class);
    long pages = Math.max(1, (total + size - 1) / size);
    int page = (int) Math.min(requestedPage, pages);
    params.put("limit", size);
    params.put("offset", (page - 1) * size);
    var ids =
        db.queryForList(
            "select s.id from worksites s where "
                + where
                + " order by s.management_number nulls last,s.id limit :limit offset :offset",
            params,
            Long.class);
    var items =
        ids.stream()
            .map(
                id -> {
                  var item = detail(id, admin);
                  item.put("photoCount", ((List<?>) item.remove("photos")).size());
                  item.remove("note");
                  return item;
                })
            .toList();
    return Map.of(
        "items", items, "page", page, "pageSize", size, "total", total, "totalPages", pages);
  }

  private String where(Filter filter, Map<String, Object> params) {
    StringBuilder where = new StringBuilder("true");
    if (filter.middleBlockId() != null) {
      where.append(" and s.middle_block=:middle");
      params.put("middle", filter.middleBlockId());
    }
    if (filter.smallBlockId() != null) {
      where.append(" and s.small_block=:small");
      params.put("small", filter.smallBlockId());
    }
    if (filter.q() != null && !filter.q().isBlank()) {
      where.append(
          " and (s.consumer_number ilike :q or s.name ilike :q or s.address ilike :q or"
              + " s.management_number ilike :q)");
      params.put(
          "q",
          "%"
              + filter.q().trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
              + "%");
    }
    if (filter.status() != null) {
      if (!List.of("TODO", "IN_PROGRESS", "DONE").contains(filter.status()))
        throw new IllegalArgumentException();
      String end = "exists(select 1 from inspections i where i.site_id=s.id and i.phase='END')";
      String start = "exists(select 1 from inspections i where i.site_id=s.id and i.phase='START')";
      where
          .append(" and ")
          .append(
              switch (filter.status()) {
                case "DONE" -> end;
                case "IN_PROGRESS" -> start + " and not " + end;
                default -> "not " + start + " and not " + end;
              });
    }
    return where.toString();
  }

  public Map<String, Object> detailWithSource(long id, boolean admin) {
    var site = detail(id, admin);
    site.put(
        "sourceMonthlyValues",
        db.queryForList(
            "select to_char(month,'YYYY-MM') as month,group_a as \"groupA\",group_b as"
                + " \"groupB\",group_c as \"groupC\" from source_monthly_values where site_id=:id"
                + " order by month",
            Map.of("id", id)));
    return site;
  }

  public Map<String, Object> detail(long id, boolean admin) {
    var rows =
        db.queryForList(
            "select *,source_cells->>'AZ' as supply_number,source_cells->>'J' as"
                + " meter_diameter,source_cells->>'K' as household_count,source_cells->>'L' as"
                + " sewer_raw,source_cells->>'AX' as business_name,source_cells->>'BC' as"
                + " source_reader,source_cells->>'BD' as regular_reading_day from worksites where"
                + " id=:id",
            Map.of("id", id));
    if (rows.isEmpty()) throw new ApiException(404, "SITE_NOT_FOUND", "수용가를 찾을 수 없습니다.");
    var row = rows.getFirst();
    var site = new LinkedHashMap<String, Object>();
    site.put("id", id);
    site.put("middleBlockId", text(row, "middle_block"));
    site.put("smallBlockId", text(row, "small_block"));
    site.put("name", text(row, "name"));
    site.put("address", text(row, "address"));
    site.put("waterNo", text(row, "supply_number"));
    site.put("consumerNumber", row.get("consumer_number"));
    site.put("managementNo", text(row, "management_number"));
    site.put("zone", text(row, "small_block"));
    site.put("industry", text(row, "industry"));
    site.put("meterNo", text(row, "meter_number"));
    site.put("supplyArea", ""); // Not present in the supplied workbook; do not invent a mapping.
    site.put("oldAddress", text(row, "old_address"));
    site.put("meterDiameter", text(row, "meter_diameter"));
    site.put("householdCount", text(row, "household_count"));
    site.put("sewerRaw", text(row, "sewer_raw"));
    site.put("businessName", text(row, "business_name"));
    site.put("sourceReader", text(row, "source_reader"));
    site.put("regularReadingDay", text(row, "regular_reading_day"));
    site.put("sealed", null);
    site.put("meterPresenceRaw", text(row, "meter_presence_raw"));
    site.put("latitude", row.get("latitude"));
    site.put("longitude", row.get("longitude"));
    site.put("note", row.get("note"));
    var photos =
        db.queryForList(
            "select id,slot from photos where site_id=:id order by case slot when 'OVERVIEW' then 1"
                + " when 'START_CLOSEUP' then 2 when 'END_CLOSEUP' then 3 when 'TEMPORARY' then 4"
                + " when 'EXTRA_1' then 5 else 6 end",
            Map.of("id", id));
    for (var photo : photos)
      photo.put("url", "/api/sites/" + id + "/photos/" + photo.get("id") + "/content");
    site.put("photos", photos);
    var inspections = new LinkedHashMap<String, Object>();
    java.math.BigDecimal start = null, end = null;
    for (var record :
        db.queryForList(
            "select i.*,u.nickname from inspections i join users u on u.id=i.worker_id where"
                + " site_id=:id",
            Map.of("id", id))) {
      var value = new LinkedHashMap<String, Object>();
      value.put("date", record.get("inspection_date").toString());
      value.put("reading", record.get("reading"));
      value.put("workerId", record.get("worker_id"));
      value.put("workerName", record.get("nickname"));
      value.put("recordedAt", ((java.sql.Timestamp) record.get("recorded_at")).toInstant());
      value.put("updatedAt", ((java.sql.Timestamp) record.get("updated_at")).toInstant());
      if (admin) {
        value.put("fee", record.get("fee"));
        value.put("settlementStatus", record.get("settlement_status"));
      }
      inspections.put((String) record.get("phase"), value);
      if (record.get("phase").equals("START")) start = (java.math.BigDecimal) record.get("reading");
      else end = (java.math.BigDecimal) record.get("reading");
    }
    site.put("inspections", inspections);
    site.put("usage", com.meter.fieldwork.inspection.InspectionRules.usage(start, end));
    SpecialCondition condition = SpecialCondition.valueOf((String) row.get("special_condition"));
    site.put(
        "specialCondition",
        Map.of(
            "code",
            condition.name(),
            "label",
            condition.label,
            "description",
            row.get("special_description")));
    site.put("updatedAt", ((java.sql.Timestamp) row.get("updated_at")).toInstant());
    return site;
  }

  public List<Map<String, Object>> blocks() {
    var values =
        db.queryForList(
            "select distinct middle_block,small_block from worksites order by"
                + " middle_block,small_block",
            Map.of());
    var blocks = new ArrayList<Map<String, Object>>();
    var seen = new HashSet<String>();
    for (var row : values) {
      String middle = text(row, "middle_block"), small = text(row, "small_block");
      if (!middle.isBlank() && seen.add(middle)) blocks.add(Map.of("id", middle, "name", middle));
      if (!small.isBlank()) blocks.add(Map.of("id", small, "name", small, "parentId", middle));
    }
    return blocks;
  }

  public Map<String, Object> summary(Filter filter, long actor, boolean admin) {
    var params = new HashMap<String, Object>();
    String where = where(filter, params);
    long total =
        db.queryForObject("select count(*) from worksites s where " + where, params, Long.class);
    var counts =
        db.queryForMap(
            "select count(*) filter(where phase='START') as starts,count(*) filter(where"
                + " phase='END') as ends,count(*) filter(where phase='START' and worker_id=:actor)"
                + " as own_start,count(*) filter(where phase='END' and worker_id=:actor) as own_end"
                + " from inspections i join worksites s on s.id=i.site_id where "
                + where,
            withActor(params, actor));
    long done =
        db.queryForObject(
            "select count(*) from worksites s where "
                + where
                + " and exists(select 1 from inspections i where i.site_id=s.id and phase='END')",
            params,
            Long.class);
    long progress =
        db.queryForObject(
            "select count(*) from worksites s where "
                + where
                + " and exists(select 1 from inspections i where i.site_id=s.id and phase='START')"
                + " and not exists(select 1 from inspections i where i.site_id=s.id and"
                + " phase='END')",
            params,
            Long.class);
    var workers =
        admin
            ? db.queryForList(
                "select worker_id as \"workerId\",count(*) filter(where phase='START') as"
                    + " \"startCount\",count(*) filter(where phase='END') as \"endCount\" from"
                    + " inspections i join worksites s on s.id=i.site_id where "
                    + where
                    + " group by worker_id",
                params)
            : List.of();
    return Map.of(
        "total",
        total,
        "done",
        done,
        "progress",
        progress,
        "todo",
        total - done - progress,
        "startCount",
        counts.get("starts"),
        "endCount",
        counts.get("ends"),
        "ownStartCount",
        counts.get("own_start"),
        "ownEndCount",
        counts.get("own_end"),
        "workers",
        workers);
  }

  @Transactional
  public Map<String, Object> condition(
      long id, long actor, SpecialCondition condition, String description, boolean admin) {
    if (condition == null || (description != null && description.length() > 2000))
      throw new IllegalArgumentException();
    lock(id);
    var before = detail(id, admin);
    db.update(
        "update worksites set"
            + " special_condition=:code,special_description=:description,updated_at=clock_timestamp()"
            + " where id=:id",
        Map.of(
            "code",
            condition.name(),
            "description",
            description == null ? "" : description,
            "id",
            id));
    var after = detail(id, admin);
    audit(id, actor, before, after);
    return after;
  }

  @Transactional
  public Map<String, Object> note(long id, long actor, String note, boolean admin) {
    if (note == null || note.length() > 4000) throw new IllegalArgumentException();
    lock(id);
    var before = detail(id, admin);
    db.update(
        "update worksites set note=:note,updated_at=clock_timestamp() where id=:id",
        Map.of("note", note, "id", id));
    var after = detail(id, admin);
    audit(id, actor, before, after);
    return after;
  }

  @Transactional
  public boolean saveCoordinates(
      long id,
      long actor,
      String expectedAddress,
      String expectedOldAddress,
      java.math.BigDecimal latitude,
      java.math.BigDecimal longitude) {
    lock(id);
    var before = detail(id, true);
    if (before.get("latitude") != null && before.get("longitude") != null) return false;
    if (!Objects.equals(before.get("address"), expectedAddress)
        || !Objects.equals(before.get("oldAddress"), expectedOldAddress)) return false;
    if (latitude == null
        || longitude == null
        || latitude.abs().compareTo(java.math.BigDecimal.valueOf(90)) > 0
        || longitude.abs().compareTo(java.math.BigDecimal.valueOf(180)) > 0)
      throw new IllegalArgumentException();
    db.update(
        "update worksites set latitude=:lat,longitude=:lon,updated_at=clock_timestamp() where"
            + " id=:id",
        Map.of("lat", latitude, "lon", longitude, "id", id));
    audit(id, actor, before, detail(id, true));
    return true;
  }

  private void lock(long id) {
    if (db.queryForList("select id from worksites where id=:id for update", Map.of("id", id))
        .isEmpty()) throw new ApiException(404, "SITE_NOT_FOUND", "수용가를 찾을 수 없습니다.");
  }

  private void audit(long id, long actor, Map<String, Object> before, Map<String, Object> after) {
    try {
      db.update(
          "insert into worksite_edits(site_id,actor_id,before_value,after_value)"
              + " values(:id,:actor,:before::jsonb,:after::jsonb)",
          Map.of(
              "id",
              id,
              "actor",
              actor,
              "before",
              json.writeValueAsString(before),
              "after",
              json.writeValueAsString(after)));
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private static String text(Map<String, Object> row, String key) {
    return Objects.toString(row.get(key), "");
  }

  private static Map<String, Object> withActor(Map<String, Object> params, long actor) {
    var result = new HashMap<String, Object>(params);
    result.put("actor", actor);
    return result;
  }
}
