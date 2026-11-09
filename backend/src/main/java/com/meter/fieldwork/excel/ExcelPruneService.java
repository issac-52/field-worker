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
      "consumer_number not in (select jsonb_array_elements_text(?::jsonb))";

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
            "select consumer_number as \"consumerNumber\",middle_block as \"middleBlock\" from"
                + " worksites where "
                + OUTSIDE
                + " order by id limit 50",
            keep));
    return summary;
  }

  @Transactional(isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Map<String, Object> preview(InputStream file, long actor) {
    var keep = new LinkedHashSet<String>();
    int[] rows = {0, 0};
    new ExcelRows()
        .read(
            file,
            row -> {
              if (++rows[0] > 50000) throw new ApiException(400, "TOO_MANY_ROWS", "최대 50,000행입니다.");
              if (row.hidden()) {
                rows[1]++;
                return;
              }
              if (row.cell("C").isBlank())
                throw new ApiException(
                    400, "INVALID_VISIBLE_ROW", "보이는 행에 수용가번호가 없습니다. 파일을 확인하세요.");
              keep.add(row.cell("C"));
            });
    if (keep.isEmpty())
      throw new ApiException(400, "EMPTY_VISIBLE_ROWS", "보이는 수용가가 없어 삭제를 진행할 수 없습니다.");
    String numbers = encode(keep);
    var result = summary(numbers);
    if (((Number) result.get("keepCount")).longValue() != keep.size())
      throw new ApiException(
          409, "VISIBLE_NOT_IMPORTED", "보이는 수용가 중 DB에 없는 번호가 있습니다. 먼저 보이는 행을 신규 등록하세요.");
    UUID id = UUID.randomUUID();
    db.update(
        "insert into excel_prune_plans(id,created_by,keep_numbers,fingerprint)"
            + " values(?,?,?::jsonb,?)",
        id,
        actor,
        numbers,
        fingerprint());
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
            "select *,keep_numbers::text as keep_json from excel_prune_plans where id=? and"
                + " created_by=? and expires_at>now() and not executed for update",
            id,
            actor);
    if (plans.isEmpty())
      throw new ApiException(404, "PRUNE_PLAN_NOT_FOUND", "삭제 미리보기가 없거나 만료/실행됐습니다.");
    var plan = plans.getFirst();
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
