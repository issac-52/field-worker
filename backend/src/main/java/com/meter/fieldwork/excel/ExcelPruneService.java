package com.meter.fieldwork.excel;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.document.DocumentService;
import com.meter.fieldwork.global.ApiException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExcelPruneService {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final DocumentService documents;

  public ExcelPruneService(JdbcTemplate db, ObjectMapper json, DocumentService documents) {
    this.db = db;
    this.json = json;
    this.documents = documents;
  }

  private static final String OUTSIDE =
      "id not in (select value::bigint from jsonb_array_elements_text(?::jsonb))";

  private String encode(Object o) {
    try {
      return json.writeValueAsString(o);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private String fingerprint() {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      db.query(
          """
          select jsonb_build_object('site',to_jsonb(s),'photos',coalesce((select jsonb_agg(to_jsonb(p) order by id) from photos p where p.site_id=s.id),'[]'::jsonb),
            'inspections',coalesce((select jsonb_agg(to_jsonb(i) order by id) from inspections i where i.site_id=s.id),'[]'::jsonb))::text as snapshot from worksites s order by id
          """,
          (RowCallbackHandler)
              row -> digest.update(row.getString(1).getBytes(StandardCharsets.UTF_8)));
      db.query(
          "select id::text from document_jobs order by id",
          (RowCallbackHandler)
              row -> digest.update(row.getString(1).getBytes(StandardCharsets.UTF_8)));
      return HexFormat.of().formatHex(digest.digest());
    } catch (Exception e) {
      throw new IllegalStateException("Prune validation failed", e);
    }
  }

  private long count(String sql, Object... args) {
    return db.queryForObject(sql, Long.class, args);
  }

  private Map<String, Object> summary(String keep) {
    String targets = "select id from worksites where " + OUTSIDE;
    long blocked =
        count(
            "select count(distinct i.site_id) from inspections i where i.site_id in ("
                + targets
                + ") and (i.settlement_status<>'OPEN' or exists(select 1 from settlement_records r"
                + " where r.inspection_id=i.id))",
            keep);
    var summary = new LinkedHashMap<String, Object>();
    summary.put(
        "keepCount", count("select count(*) from worksites where not (" + OUTSIDE + ")", keep));
    summary.put("deleteCount", count("select count(*) from worksites where " + OUTSIDE, keep));
    summary.put(
        "photoCount",
        count("select count(*) from photos where site_id in (" + targets + ")", keep));
    summary.put(
        "inspectionCount",
        count("select count(*) from inspections where site_id in (" + targets + ")", keep));
    summary.put("protectedCount", blocked);
    summary.put(
        "documentJobCount",
        count(
            "select count(distinct job_id) from document_job_items where site_id in ("
                + targets
                + ")",
            keep));
    summary.put(
        "sample",
        db.queryForList(
            "select id,consumer_number as \"consumerNumber\",name,address,middle_block as"
                + " \"middleBlock\" from worksites where "
                + OUTSIDE
                + " order by id limit 50",
            keep));
    return summary;
  }

  @Transactional(isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Map<String, Object> preview(InputStream file, long actor) {
    var visible = new LinkedHashSet<WorksiteIdentity>();
    var hidden = new LinkedHashSet<WorksiteIdentity>();
    int[] rows = {0, 0, 0, 0, 0, 0};
    new ExcelRows()
        .read(
            file,
            row -> {
              if (++rows[0] > 50000) throw new ApiException(400, "TOO_MANY_ROWS", "최대 50,000행입니다.");
              var identity = WorksiteIdentity.from(row);
              if (row.hidden()) {
                rows[1]++;
                if (row.cell("C").isBlank()) rows[2]++;
                if (identity == null) rows[4]++;
                else hidden.add(identity);
              } else {
                if (row.cell("C").isBlank()) rows[3]++;
                if (identity == null) rows[5]++;
                else visible.add(identity);
              }
            });
    if (visible.isEmpty())
      throw new ApiException(400, "EMPTY_VISIBLE_ROWS", "보이는 수용가를 식별할 번호 또는 주소·이름이 없습니다.");
    if (rows[1] == 0)
      throw new ApiException(400, "NO_HIDDEN_ROWS", "저장된 파일에 숨긴 행이 없습니다. 필터 적용 후 저장했는지 확인하세요.");
    int overlaps = hidden.size();
    hidden.removeAll(visible);
    overlaps -= hidden.size();
    var keepIds = new ArrayList<Long>();
    var matched = new HashSet<WorksiteIdentity>();
    db.query(
        "select id,consumer_number,address,name from worksites order by id",
        (RowCallbackHandler)
            row -> {
              var identity =
                  WorksiteIdentity.of(
                      row.getString("consumer_number"),
                      row.getString("address"),
                      row.getString("name"));
              if (hidden.contains(identity)) matched.add(identity);
              else keepIds.add(row.getLong("id"));
            });
    if (keepIds.isEmpty())
      throw new ApiException(400, "EMPTY_KEEP_SET", "DB 전체 삭제는 지원하지 않습니다. 필터와 식별 정보를 확인하세요.");
    String keep = encode(keepIds);
    var result = summary(keep);
    result.put("scope", "HIDDEN_ROWS");
    result.put("identityVersion", 2);
    result.put("visibleDuplicateNumbers", overlaps);
    result.put("visibleDuplicateIdentities", overlaps);
    result.put("hiddenRowsWithoutNumber", rows[2]);
    result.put("visibleRowsWithoutNumber", rows[3]);
    result.put("hiddenRowsWithoutIdentity", rows[4]);
    result.put("visibleRowsWithoutIdentity", rows[5]);
    result.put("unmatchedHiddenNumbers", hidden.size() - matched.size());
    result.put("unmatchedHiddenIdentities", hidden.size() - matched.size());
    UUID id = UUID.randomUUID();
    db.update(
        "insert into excel_prune_plans(id,created_by,keep_numbers,keep_site_ids,fingerprint,result)"
            + " values(?,?,'[]'::jsonb,?::jsonb,?,?::jsonb)",
        id,
        actor,
        keep,
        fingerprint(),
        encode(Map.of("scope", "HIDDEN_ROWS", "identityVersion", 2)));
    result.put("planId", id);
    result.put("hiddenRows", rows[1]);
    result.put("confirmation", result.get("deleteCount") + "건 삭제");
    result.put("expiresInMinutes", 15);
    return result;
  }

  @Transactional
  public Map<String, Object> execute(UUID id, long actor, String confirmation) {
    if (!db.queryForObject("select pg_try_advisory_xact_lock(4285102)", Boolean.class))
      throw new ApiException(409, "DOCUMENT_BUSY", "문서 작업 처리 중입니다. 취소 후 잠시 기다리거나 다시 시도하세요.");
    db.execute("lock table worksites in exclusive mode");
    db.execute(
        "lock table"
            + " photos,inspections,settlement_records,worksite_edits,inspection_edits,fee_adjustments,fee_adjustment_items,document_jobs,document_job_items,document_parts,document_cache,document_artifacts"
            + " in share row exclusive mode");
    var plans =
        db.queryForList(
            "select *,result->>'scope' as prune_scope,result->>'identityVersion' as"
                + " identity_version,keep_site_ids::text as keep_json from excel_prune_plans where"
                + " id=? and created_by=? and expires_at>now() and not executed for update",
            id,
            actor);
    if (plans.isEmpty())
      throw new ApiException(404, "PRUNE_PLAN_NOT_FOUND", "삭제 미리보기가 없거나 만료/실행됐습니다.");
    var plan = plans.getFirst();
    if (!"HIDDEN_ROWS".equals(plan.get("prune_scope"))
        || !"2".equals(plan.get("identity_version"))
        || plan.get("keep_json") == null)
      throw new ApiException(409, "PRUNE_SCOPE_CHANGED", "삭제 범위 또는 식별 기준이 변경됐습니다. 미리보기를 다시 확인하세요.");
    String keep = (String) plan.get("keep_json");
    var result = summary(keep);
    if (!Objects.equals(plan.get("fingerprint"), fingerprint()))
      throw new ApiException(409, "PRUNE_STALE", "미리보기 후 데이터가 변경됐습니다. 삭제 대상을 다시 확인하세요.");
    if (!Objects.equals(confirmation, result.get("deleteCount") + "건 삭제"))
      throw new ApiException(400, "CONFIRMATION_REQUIRED", "삭제 건수 확인 문구를 정확히 입력하세요.");
    if (((Number) result.get("protectedCount")).longValue() > 0)
      throw new ApiException(
          409, "SETTLEMENT_PROTECTED", "확정 또는 지급 정산이 있는 수용가가 포함돼 삭제 전체를 차단했습니다.");
    db.update(
        "create temporary table prune_targets on commit drop as select id from worksites where "
            + OUTSIDE,
        keep);
    List<Long> ids = db.queryForList("select id from prune_targets", Long.class);
    documents.removeForSites(ids);
    db.update(
        "insert into photo_deletions(object_key) select object_key from photos where site_id in"
            + " (select id from prune_targets) on conflict do nothing");
    db.update("delete from photos where site_id in (select id from prune_targets)");
    db.update("delete from inspection_edits where site_id in (select id from prune_targets)");
    db.update(
        "delete from fee_adjustment_items where inspection_id in (select id from inspections where"
            + " site_id in (select id from prune_targets))");
    db.update("delete from inspections where site_id in (select id from prune_targets)");
    db.update("delete from worksite_edits where site_id in (select id from prune_targets)");
    int deleted = db.update("delete from worksites where id in (select id from prune_targets)");
    var done =
        Map.<String, Object>of(
            "deleted",
            deleted,
            "photoCount",
            result.get("photoCount"),
            "inspectionCount",
            result.get("inspectionCount"),
            "documentJobCount",
            result.get("documentJobCount"));
    db.update(
        "update excel_prune_plans set executed=true,result=?::jsonb where id=?", encode(done), id);
    return done;
  }
}
