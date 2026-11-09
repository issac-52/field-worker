package com.meter.fieldwork;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.document.*;
import com.meter.fieldwork.excel.*;
import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.photo.ObjectStorage;
import java.io.*;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

class VisibleImportPruneTest extends PostgresIntegrationTest {
  JdbcTemplate db;
  TransactionTemplate tx;
  ExcelImportService imports;
  ExcelRepairService repairs;
  ExcelPruneService prune;
  DocumentService documents;
  @Autowired ObjectMapper json;
  String schema;
  DriverManagerDataSource ds;
  long actor, keep, drop;

  @BeforeEach
  void setup() throws Exception {
    schema = "prune_" + UUID.randomUUID().toString().replace("-", "");
    ds =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl()
                + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
                + "currentSchema="
                + schema,
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).load().migrate();
    db = new JdbcTemplate(ds);
    tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
    var storage =
        new ObjectStorage() {
          final Map<String, byte[]> data = new HashMap<>();

          public void put(String key, byte[] bytes, String type) {
            data.put(key, bytes);
          }

          public byte[] get(String key) {
            return Objects.requireNonNull(data.get(key));
          }

          public void delete(String key) {
            data.remove(key);
          }
        };
    documents =
        new DocumentService(
            db, storage, json, new HwpxCardRenderer(), new DataSourceTransactionManager(ds));
    imports = new ExcelImportService(db, json);
    repairs = new ExcelRepairService(db, json);
    prune = new ExcelPruneService(db, json, documents);
    actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role)"
                + " values('test','Test','unused','ADMIN') returning id",
            Long.class);
  }

  @AfterEach
  void clean() {
    db.execute("drop schema " + schema + " cascade");
  }

  byte[] file(String keep, String hidden) throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Test");
      var h = sheet.createRow(1);
      h.createCell(2).setCellValue("수용가번호");
      h.createCell(3).setCellValue("수용가명");
      h.createCell(4).setCellValue("새주소");
      var a = sheet.createRow(2);
      a.createCell(2).setCellValue(hidden);
      a.createCell(3).setCellValue("Hidden name");
      a.setZeroHeight(true);
      var b = sheet.createRow(3);
      b.createCell(2).setCellValue(keep);
      b.createCell(3).setCellValue("Visible name");
      book.write(out);
      return out.toByteArray();
    }
  }

  void seed() throws Exception {
    byte[] input = file("keep", "drop");
    tx.execute(s -> imports.importWorkbook(new ByteArrayInputStream(input), actor, false));
    keep = db.queryForObject("select id from worksites where consumer_number='keep'", Long.class);
    drop = db.queryForObject("select id from worksites where consumer_number='drop'", Long.class);
  }

  Map<String, Object> preview(byte[] bytes) {
    return tx.execute(s -> prune.preview(new ByteArrayInputStream(bytes), actor));
  }

  Map<String, Object> execute(Map<String, Object> plan) {
    return tx.execute(
        s -> prune.execute((UUID) plan.get("planId"), actor, (String) plan.get("confirmation")));
  }

  @Test
  void deletesOnlyHiddenNumbersAndKeepsVisibleDuplicatesAndRowsOutsideTheWorkbook()
      throws Exception {
    seed();
    db.update(
        "insert into worksites(consumer_number,source_cells,source_sheet,source_row,import_job_id)"
            + " select 'outside','{}','Test',3,import_job_id from worksites where id=?",
        keep);
    byte[] input;
    try (var book = new XSSFWorkbook(new ByteArrayInputStream(file("keep", "drop")));
        var out = new ByteArrayOutputStream()) {
      book.getSheetAt(0).createRow(4).createCell(3).setCellValue("Visible row without number");
      var duplicate = book.getSheetAt(0).createRow(5);
      duplicate.createCell(2).setCellValue("keep");
      duplicate.setZeroHeight(true);
      book.write(out);
      input = out.toByteArray();
    }
    var plan = preview(input);
    assertThat(((Number) plan.get("deleteCount")).intValue()).isEqualTo(1);
    assertThat(((Number) plan.get("hiddenRows")).intValue()).isEqualTo(2);
    execute(plan);
    assertThat(
            db.queryForList(
                "select consumer_number from worksites order by consumer_number", String.class))
        .containsExactly("keep", "outside");
  }

  @Test
  void confirmationOwnershipExpiryAndEmptyVisibilityPreventDeletion() throws Exception {
    seed();
    var plan = preview(file("keep", "drop"));
    assertThatThrownBy(
            () -> tx.execute(status -> prune.execute((UUID) plan.get("planId"), actor, "wrong")))
        .isInstanceOf(ApiException.class);
    assertThatThrownBy(
            () ->
                tx.execute(
                    status ->
                        prune.execute(
                            (UUID) plan.get("planId"),
                            actor + 10000,
                            (String) plan.get("confirmation"))))
        .isInstanceOf(ApiException.class);
    db.update("update excel_prune_plans set result=null");
    assertThatThrownBy(() -> execute(plan))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("범위");
    db.update("update excel_prune_plans set result='{\"scope\":\"HIDDEN_ROWS\"}'");
    db.update("update excel_prune_plans set expires_at=now()-interval '1 second'");
    assertThatThrownBy(() -> execute(plan)).isInstanceOf(ApiException.class);
    byte[] allHidden;
    try (var book = new XSSFWorkbook(new ByteArrayInputStream(file("keep", "drop")));
        var out = new ByteArrayOutputStream()) {
      book.getSheetAt(0).getRow(3).setZeroHeight(true);
      book.write(out);
      allHidden = out.toByteArray();
    }
    assertThatThrownBy(() -> preview(allHidden))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("보이는 수용가");
    assertThat(db.queryForObject("select count(*) from worksites", Integer.class)).isEqualTo(2);
  }

  @Test
  void visibleModeExcludesHiddenBeforeDuplicateChecksAndRepairAlsoSkips() throws Exception {
    byte[] input = file("same", "same");
    var result =
        tx.execute(s -> imports.importWorkbook(new ByteArrayInputStream(input), actor, true));
    assertThat(result.inserted()).isEqualTo(1);
    assertThat(result.duplicateInFile()).isZero();
    assertThat(result.hiddenRows()).isEqualTo(1);
    assertThat(result.skippedRows().getFirst().rowNumber()).isEqualTo(3);
    assertThat(result.skippedRows().getFirst().reason()).isEqualTo("HIDDEN_ROW");
    assertThat(
            db.queryForObject(
                "select name from worksites where consumer_number='same'", String.class))
        .isEqualTo("Visible name");
    seed();
    db.update("update worksites set name='',source_cells='{}'");
    byte[] repair = file("keep", "drop");
    var repaired = tx.execute(s -> repairs.repair(new ByteArrayInputStream(repair), actor, true));
    assertThat(repaired.hiddenRows()).isEqualTo(1);
    assertThat(db.queryForObject("select name from worksites where id=?", String.class, drop))
        .isEmpty();
    assertThat(db.queryForObject("select name from worksites where id=?", String.class, keep))
        .isEqualTo("Visible name");
  }

  @Test
  void previewsThenDeletesComplementAndOpenHistoryAndInvalidatesMixedDocuments() throws Exception {
    seed();
    db.update(
        "insert into photos(site_id,slot,object_key,content_type,size_bytes,uploaded_by)"
            + " values(?,'TEMPORARY','test-photo','image/png',1,?)",
        drop,
        actor);
    db.update(
        "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee)"
            + " values(?,'START','2026-11-01',1,?,0)",
        drop,
        actor);
    UUID job = documents.create(new DocumentService.Request(null, null, null, "Test"), actor);
    documents.tick();
    var plan = preview(file("keep", "drop"));
    assertThat(((Number) plan.get("deleteCount")).intValue()).isEqualTo(1);
    assertThat(((Number) plan.get("documentJobCount")).intValue()).isEqualTo(1);
    assertThat(db.queryForObject("select count(*) from worksites", Integer.class)).isEqualTo(2);
    assertThat(execute(plan).get("deleted")).isEqualTo(1);
    assertThat(db.queryForList("select consumer_number from worksites", String.class))
        .containsExactly("keep");
    assertThat(db.queryForObject("select count(*) from inspections", Integer.class)).isZero();
    assertThat(db.queryForObject("select count(*) from photos", Integer.class)).isZero();
    assertThat(
            db.queryForObject(
                "select count(*) from photo_deletions where object_key='test-photo'",
                Integer.class))
        .isEqualTo(1);
    assertThatThrownBy(() -> documents.status(job, actor)).isInstanceOf(ApiException.class);
  }

  @Test
  void protectsConfirmedSettlementsAndRejectsStaleEmptyOrUnknownKeepSets() throws Exception {
    seed();
    db.update(
        "insert into"
            + " inspections(site_id,phase,inspection_date,reading,worker_id,fee,settlement_status)"
            + " values(?,'START','2026-11-01',1,?,0,'CONFIRMED')",
        drop,
        actor);
    var protectedPlan = preview(file("keep", "drop"));
    assertThat(((Number) protectedPlan.get("protectedCount")).intValue()).isEqualTo(1);
    assertThatThrownBy(() -> execute(protectedPlan))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("정산");
    db.update("update inspections set settlement_status='OPEN'");
    db.update(
        "insert into"
            + " settlement_records(inspection_id,worker_id,snapshot_date,fee,confirmed_by,paid_by,paid_at)"
            + " select id,worker_id,inspection_date,fee,?,?,now() from inspections where site_id=?",
        actor,
        actor,
        drop);
    var paid = preview(file("keep", "drop"));
    assertThatThrownBy(() -> execute(paid))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("정산");
    db.update("delete from settlement_records");

    var stale = preview(file("keep", "drop"));
    db.update("update worksites set name='Changed' where id=?", drop);
    assertThatThrownBy(() -> execute(stale))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("변경");
    assertThat(db.queryForObject("select count(*) from worksites", Integer.class)).isEqualTo(2);
    byte[] unknown = file("unknown", "drop");
    assertThat(((Number) preview(unknown).get("deleteCount")).intValue()).isEqualTo(1);
  }
}
