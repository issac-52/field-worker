package com.meter.fieldwork.document;

import com.fasterxml.jackson.databind.*;
import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.photo.ObjectStorage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class DocumentService {
  private final JdbcTemplate db;
  private final ObjectStorage storage;
  private final ObjectMapper json;
  private final HwpxCardRenderer renderer;
  private final TransactionTemplate tx;

  public DocumentService(
      JdbcTemplate db,
      ObjectStorage storage,
      ObjectMapper json,
      HwpxCardRenderer renderer,
      org.springframework.transaction.PlatformTransactionManager manager) {
    this.db = db;
    this.storage = storage;
    this.json = json;
    this.renderer = renderer;
    this.tx = new TransactionTemplate(manager);
  }

  public record Request(Long siteId, String middleBlock, String smallBlock, String title) {}

  public UUID create(Request request, long actor) {
    String title = Objects.toString(request.title(), "").strip();
    if (title.isBlank() || title.length() > 100)
      throw new IllegalArgumentException("문서 제목은 1~100자로 입력하세요.");
    return tx.execute(
        status -> {
          db.execute("select pg_advisory_xact_lock(4285101)");
          if (db.queryForObject(
                  "select count(*) from document_jobs where status in ('QUEUED','RUNNING') and"
                      + " expires_at>now()",
                  Integer.class)
              >= 3)
            throw new ApiException(409, "EXPORT_BUSY", "문서 생성 요청이 많습니다. 진행 중인 작업 완료 후 다시 시도하세요.");
          var args = new ArrayList<Object>();
          String where = "true";
          if (request.siteId() != null) {
            where += " and id=?";
            args.add(request.siteId());
          }
          if (request.middleBlock() != null && !request.middleBlock().isBlank()) {
            where += " and middle_block=?";
            args.add(request.middleBlock());
          }
          if (request.smallBlock() != null && !request.smallBlock().isBlank()) {
            where += " and small_block=?";
            args.add(request.smallBlock());
          }
          var ids =
              db.queryForList(
                  "select id from worksites where " + where + " order by id limit 50001",
                  Long.class,
                  args.toArray());
          if (ids.isEmpty()) throw new ApiException(400, "EMPTY_EXPORT", "선택한 조건에 수용가가 없습니다.");
          if (ids.size() > 50000)
            throw new ApiException(400, "EXPORT_LIMIT", "블록을 나누어 50,000건 이하로 요청하세요.");
          UUID id = UUID.randomUUID();
          db.update(
              "insert into document_jobs(id,created_by,title,total) values(?,?,?,?)",
              id,
              actor,
              title,
              ids.size());
          var rows = new ArrayList<Object[]>();
          for (int i = 0; i < ids.size(); i++) rows.add(new Object[] {id, i + 1, ids.get(i)});
          db.batchUpdate(
              "insert into document_job_items(job_id,ordinal,site_id) values(?,?,?)", rows);
          return id;
        });
  }

  public List<Map<String, Object>> list(long actor) {
    return db.queryForList(
        "select id,title,status,total,completed,error,created_at as \"createdAt\",expires_at as"
            + " \"expiresAt\" from document_jobs where created_by=? and expires_at>now() order by"
            + " created_at desc limit 20",
        actor);
  }

  private Map<String, Object> job(UUID id, long actor) {
    var rows =
        db.queryForList(
            "select * from document_jobs where id=? and created_by=? and expires_at>now()",
            id,
            actor);
    if (rows.isEmpty())
      throw new ApiException(404, "EXPORT_NOT_FOUND", "문서 작업이 없거나 보관 기간이 만료됐습니다.");
    return rows.getFirst();
  }

  public Map<String, Object> status(UUID id, long actor) {
    var job = job(id, actor);
    return Map.of(
        "id",
        id,
        "status",
        job.get("status"),
        "title",
        job.get("title"),
        "total",
        job.get("total"),
        "completed",
        job.get("completed"),
        "error",
        Objects.toString(job.get("error"), ""),
        "parts",
        db.queryForList(
            "select part,first_ordinal as \"firstOrdinal\",last_ordinal as \"lastOrdinal\" from"
                + " document_parts where job_id=? order by part",
            id));
  }

  private static final String SNAPSHOT =
"""
jsonb_build_object('site',to_jsonb(s),
            'inspections',coalesce((select jsonb_agg(to_jsonb(i) order by phase) from inspections i where i.site_id=s.id),'[]'::jsonb),
            'photos',coalesce((select jsonb_agg(to_jsonb(p) order by slot) from photos p where p.site_id=s.id and slot in ('OVERVIEW','START_CLOSEUP','END_CLOSEUP')),'[]'::jsonb))::text
""";

  JsonNode snapshot(long id) throws Exception {
    return json.readTree(
        db.queryForObject(
            "select " + SNAPSHOT + " from worksites s where s.id=?", String.class, id));
  }

  public void checkWholeDownload(UUID id, long actor) {
    var job = job(id, actor);
    if (!"READY".equals(job.get("status")))
      throw new ApiException(409, "EXPORT_NOT_READY", "전체 문서 생성이 끝난 후 다운로드하세요.");
    var coverage =
        db.queryForMap(
            "select coalesce(sum(last_ordinal-first_ordinal+1),0) as total, count(*) filter(where"
                + " a.expires_at<=now()) as expired from document_parts p join document_artifacts a"
                + " using(object_key) where job_id=?",
            id);
    if (((Number) coverage.get("total")).intValue() != ((Number) job.get("total")).intValue()
        || ((Number) coverage.get("expired")).intValue() > 0)
      throw new ApiException(410, "EXPORT_EXPIRED", "파일이 만료됐습니다. 다시 생성해 주세요.");
    // One cursor query validates all sources without one DB round trip per document.
    tx.executeWithoutResult(
        status ->
            db.query(
                connection -> {
                  var statement =
                      connection.prepareStatement(
                          "select j.fingerprint,"
                              + SNAPSHOT
                              + " as snapshot from document_job_items j join worksites s on"
                              + " s.id=j.site_id where j.job_id=? order by j.ordinal");
                  statement.setObject(1, id);
                  statement.setFetchSize(200);
                  return statement;
                },
                (org.springframework.jdbc.core.RowCallbackHandler)
                    row -> {
                      try {
                        if (!fingerprint(
                                json.readTree(row.getString("snapshot")), (String) job.get("title"))
                            .equals(row.getString("fingerprint")))
                          throw new ApiException(
                              409, "EXPORT_STALE", "사진 또는 수용가 정보가 변경됐습니다. 문서 생성을 다시 요청하세요.");
                      } catch (ApiException ex) {
                        throw ex;
                      } catch (Exception ex) {
                        throw new IllegalStateException("Document validation failed", ex);
                      }
                    }));
  }

  public void writeWholeZip(UUID id, long actor, OutputStream output) throws IOException {
    checkWholeDownload(id, actor);
    var parts =
        db.queryForList(
            "select object_key from document_parts where job_id=? order by part", String.class, id);
    // Flatten the existing batches: the final ZIP contains HWPX files, not nested ZIPs.
    try (var zip = new ZipOutputStream(output)) {
      for (String key : parts) {
        try (var input = new ZipInputStream(new ByteArrayInputStream(storage.get(key)))) {
          for (ZipEntry entry; (entry = input.getNextEntry()) != null; ) {
            if (!entry.getName().matches("site-[0-9]+\\.hwpx"))
              throw new IOException("Invalid document entry");
            zip.putNextEntry(new ZipEntry(entry.getName()));
            input.transferTo(zip);
            zip.closeEntry();
          }
        }
        zip.flush();
        output.flush();
      }
      zip.finish();
      zip.flush();
    }
  }

  String fingerprint(JsonNode node, String title) throws Exception {
    return HexFormat.of()
        .formatHex(
            MessageDigest.getInstance("SHA-256")
                .digest(
                    (HwpxCardRenderer.VERSION + "\n" + title + "\n" + node.toString())
                        .getBytes(StandardCharsets.UTF_8)));
  }

  private String artifact(byte[] bytes, String contentType) {
    String key = UUID.randomUUID().toString();
    db.update("insert into document_artifacts(object_key) values(?)", key);
    storage.put(key, bytes, contentType);
    return key;
  }

  private byte[] card(long site, JsonNode snapshot, String title, String fingerprint)
      throws Exception {
    var cached =
        db.queryForList(
            "select c.object_key from document_cache c join document_artifacts a using(object_key)"
                + " where site_id=? and fingerprint=? and expires_at>now()",
            String.class,
            site,
            fingerprint);
    if (!cached.isEmpty()) {
      try {
        return storage.get(cached.getFirst());
      } catch (RuntimeException ex) {
        db.update(
            "delete from document_cache where site_id=? and fingerprint=?", site, fingerprint);
      }
    }
    var photos = new HashMap<String, byte[]>();
    for (var photo : snapshot.path("photos"))
      photos.put(photo.path("slot").asText(), storage.get(photo.path("object_key").asText()));
    byte[] result = renderer.render(snapshot, title, photos);
    String key = artifact(result, "application/hwp+zip");
    db.update(
        "insert into document_cache(site_id,fingerprint,object_key) values(?,?,?) on"
            + " conflict(site_id,fingerprint) do update set object_key=excluded.object_key",
        site,
        fingerprint,
        key);
    return result;
  }

  public byte[] download(UUID id, int part, long actor) {
    var job = job(id, actor);
    var parts =
        db.queryForList(
            "select p.* from document_parts p join document_artifacts a using(object_key) where"
                + " job_id=? and part=? and expires_at>now()",
            id,
            part);
    if (parts.isEmpty()) throw new ApiException(404, "EXPORT_NOT_READY", "아직 생성되지 않았거나 만료된 파일입니다.");
    var p = parts.getFirst();
    try {
      for (var item :
          db.queryForList(
              "select site_id,fingerprint from document_job_items where job_id=? and ordinal"
                  + " between ? and ? order by ordinal",
              id,
              p.get("first_ordinal"),
              p.get("last_ordinal"))) {
        String current =
            fingerprint(
                snapshot(((Number) item.get("site_id")).longValue()), (String) job.get("title"));
        if (!current.equals(item.get("fingerprint")))
          throw new ApiException(409, "EXPORT_STALE", "사진 또는 수용가 정보가 변경됐습니다. 문서 생성을 다시 요청하세요.");
      }
      return storage.get((String) p.get("object_key"));
    } catch (ApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ApiException(503, "EXPORT_UNAVAILABLE", "문서를 읽지 못했습니다. 잠시 후 다시 시도하세요.");
    }
  }

  // A database session lock serializes generation/cleanup across process restarts and instances.
  public void tick() {
    db.execute(
        (ConnectionCallback<Void>)
            connection -> {
              try (var statement = connection.createStatement();
                  var result = statement.executeQuery("select pg_try_advisory_lock(4285102)")) {
                result.next();
                if (!result.getBoolean(1)) return null;
              }
              try {
                cleanup();
                var jobs =
                    db.queryForList(
                        "select * from document_jobs where status in ('QUEUED','RUNNING') and"
                            + " expires_at>now() order by created_at limit 1");
                if (!jobs.isEmpty()) process(jobs.getFirst());
              } finally {
                try (var statement = connection.createStatement()) {
                  statement.execute("select pg_advisory_unlock(4285102)");
                }
              }
              return null;
            });
  }

  private void process(Map<String, Object> job) {
    UUID id = (UUID) job.get("id");
    String title = (String) job.get("title");
    int completed = ((Number) job.get("completed")).intValue();
    db.update("update document_jobs set status='RUNNING',error=null where id=?", id);
    try {
      var candidates =
          db.queryForList(
              "select ordinal,site_id from document_job_items where job_id=? and ordinal>? order by"
                  + " ordinal limit 50",
              id,
              completed);
      var out = new ByteArrayOutputStream();
      int last = completed;
      try (var zip = new ZipOutputStream(out)) {
        for (var row : candidates) {
          long site = ((Number) row.get("site_id")).longValue();
          JsonNode snap = snapshot(site);
          String hash = fingerprint(snap, title);
          byte[] card = card(site, snap, title, hash);
          // The document contains a consistent single-statement snapshot. Do not publish if it
          // changed while reading photos.
          if (!hash.equals(fingerprint(snapshot(site), title)))
            throw new IllegalStateException("Source changed");
          zip.putNextEntry(new ZipEntry("site-" + site + ".hwpx"));
          zip.write(card);
          zip.closeEntry();
          last = ((Number) row.get("ordinal")).intValue();
          db.update(
              "update document_job_items set fingerprint=? where job_id=? and ordinal=?",
              hash,
              id,
              last);
          if (out.size() >= 16 * 1024 * 1024) break;
        }
      }
      if (last == completed) throw new IllegalStateException("Empty job");
      String key = artifact(out.toByteArray(), "application/zip");
      int end = last;
      tx.executeWithoutResult(
          status -> {
            int part =
                db.queryForObject(
                    "select coalesce(max(part),0)+1 from document_parts where job_id=?",
                    Integer.class,
                    id);
            db.update(
                "insert into document_parts(job_id,part,object_key,first_ordinal,last_ordinal)"
                    + " values(?,?,?,?,?)",
                id,
                part,
                key,
                completed + 1,
                end);
            db.update(
                "update document_jobs set completed=?,status=case when total=? then 'READY' else"
                    + " 'QUEUED' end where id=?",
                end,
                end,
                id);
          });
    } catch (Exception ex) {
      db.update(
          "update document_jobs set status='FAILED',error=? where id=?",
          "문서 생성 중 오류가 발생했습니다. 사진/정보 변경 또는 저장소 연결을 확인하고 다시 요청하세요.",
          id);
      org.slf4j.LoggerFactory.getLogger(DocumentService.class)
          .warn("HWPX export failed for job {} ({})", id, ex.getClass().getSimpleName());
    }
  }

  private void cleanup() {
    tx.executeWithoutResult(
        status -> {
          db.update("delete from document_jobs where expires_at<=now()");
          db.update(
              "delete from document_cache where object_key in (select object_key from"
                  + " document_artifacts where expires_at<=now())");
          db.update(
              "delete from document_parts where object_key in (select object_key from"
                  + " document_artifacts where expires_at<=now())");
          db.update(
              "insert into photo_deletions(object_key) select object_key from document_artifacts"
                  + " where expires_at<=now() on conflict do nothing");
          db.update("delete from document_artifacts where expires_at<=now()");
        });
  }
}
