package com.meter.fieldwork;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.document.*;
import com.meter.fieldwork.excel.*;
import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.photo.ObjectStorage;
import com.meter.fieldwork.worksite.WorksiteService;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

class OptionalConsumerNumberTest extends PostgresIntegrationTest {
  @Autowired ObjectMapper json;
  JdbcTemplate db;
  TransactionTemplate tx;
  ExcelImportService imports;
  ExcelRepairService repairs;
  ExcelPruneService prune;
  DocumentService documents;
  DriverManagerDataSource ds;
  String schema;
  long actor;

  @BeforeEach
  void setup() throws Exception {
    schema = "identity_" + UUID.randomUUID().toString().replace("-", "");
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
    imports = new ExcelImportService(db, json);
    repairs = new ExcelRepairService(db, json);
    var storage =
        new ObjectStorage() {
          final Map<String, byte[]> values = new HashMap<>();

          public void put(String key, byte[] value, String type) {
            values.put(key, value);
          }

          public byte[] get(String key) {
            return Objects.requireNonNull(values.get(key));
          }

          public void delete(String key) {
            values.remove(key);
          }
        };
    documents =
        new DocumentService(
            db, storage, json, new HwpxCardRenderer(), new DataSourceTransactionManager(ds));
    prune = new ExcelPruneService(db, json, documents);
    actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role)"
                + " values('test','Test','unused','ADMIN') returning id",
            Long.class);
  }

  @AfterEach
  void cleanup() {
    db.execute("drop schema " + schema + " cascade");
  }

  // Rows: consumer number, name, address, optional hidden flag, optional meter number.
  byte[] workbook(String[]... rows) throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Synthetic");
      var h = sheet.createRow(1);
      h.createCell(2).setCellValue("수용가번호");
      h.createCell(3).setCellValue("수용가명");
      h.createCell(4).setCellValue("새주소");
      for (int i = 0; i < rows.length; i++) {
        var row = sheet.createRow(i + 2);
        for (int col = 0; col < 3; col++)
          if (rows[i][col] != null) row.createCell(col + 2).setCellValue(rows[i][col]);
        if (rows[i].length > 3) row.setZeroHeight(Boolean.parseBoolean(rows[i][3]));
        if (rows[i].length > 4) row.createCell(6).setCellValue(rows[i][4]);
      }
      book.write(out);
      return out.toByteArray();
    }
  }

  ImportResult upload(byte[] file, boolean visible) {
    return tx.execute(s -> imports.importWorkbook(new ByteArrayInputStream(file), actor, visible));
  }

  Map<String, Object> preview(byte[] file) {
    return tx.execute(s -> prune.preview(new ByteArrayInputStream(file), actor));
  }

  Map<String, Object> execute(Map<String, Object> plan) {
    return tx.execute(
        s -> prune.execute((UUID) plan.get("planId"), actor, (String) plan.get("confirmation")));
  }

  @Test
  void importsUnnamedNumbersByAddressAndNameAndPreservesFirstRowsOnReupload() throws Exception {
    byte[] file =
        workbook(
            new String[] {null, "Person A", "Road  1"},
            new String[] {" ", " Person A ", " Road 1 "},
            new String[] {null, "Person B", "Road 1"},
            new String[] {null, "Person A", "Road 2"},
            new String[] {"001", "Person A", "Road 1"},
            new String[] {null, "", "Road 1"},
            new String[] {null, "Person A", ""});
    var first = upload(file, false);
    assertThat(first.inserted()).isEqualTo(4);
    assertThat(first.duplicateInFile()).isEqualTo(1);
    assertThat(first.invalid()).isEqualTo(2);
    assertThat(first.skippedRows().getFirst().firstRowNumber()).isEqualTo(3);
    assertThat(first.skippedRows().getLast().reason()).isEqualTo("MISSING_ADDRESS_OR_NAME");
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where consumer_number is null", Integer.class))
        .isEqualTo(3);
    var ids = db.queryForList("select id from worksites order by id", Long.class);
    var second = upload(file, false);
    assertThat(second.inserted()).isZero();
    assertThat(second.alreadyExists()).isEqualTo(4);
    assertThat(second.duplicateInFile()).isEqualTo(1);
    assertThat(db.queryForList("select id from worksites order by id", Long.class)).isEqualTo(ids);
    assertThat(
            db.queryForObject(
                "select address from worksites where id=?", String.class, ids.getFirst()))
        .isEqualTo("Road  1");
  }

  @Test
  void concurrentUploadsCannotDuplicateAnonymousAddressAndName() throws Exception {
    byte[] file = workbook(new String[] {null, "Person A", "Road 1"});
    try (var executor = Executors.newFixedThreadPool(2)) {
      var a = executor.submit(() -> upload(file, false));
      var b = executor.submit(() -> upload(file, false));
      assertThat(a.get().inserted() + b.get().inserted()).isEqualTo(1);
    }
    assertThat(db.queryForObject("select count(*) from worksites", Integer.class)).isEqualTo(1);
  }

  @Test
  void repairsOnlyMatchingAnonymousIdentityAndKeepsNumberedSiteSeparate() throws Exception {
    upload(
        workbook(
            new String[] {null, "Person A", "Road 1"}, new String[] {"001", "Person A", "Road 1"}),
        false);
    byte[] repair =
        workbook(
            new String[] {null, " Person A ", "Road  1", "false", "METER-A"},
            new String[] {null, "Person A", "Road 1", "false", "ignored"},
            new String[] {null, "Person B", "Road 1"});
    var result = tx.execute(s -> repairs.repair(new ByteArrayInputStream(repair), actor));
    assertThat(result.updated()).isEqualTo(1);
    assertThat(result.duplicateInFile()).isEqualTo(1);
    assertThat(result.notFound()).isEqualTo(1);
    assertThat(
            db.queryForObject(
                "select meter_number from worksites where consumer_number is null", String.class))
        .isEqualTo("METER-A");
    assertThat(
            db.queryForObject(
                "select meter_number from worksites where consumer_number='001'", String.class))
        .isEmpty();
    assertThat(db.queryForObject("select count(*) from worksite_edits", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void hiddenAnonymousRowsUseIdsAndPreserveVisibleOverlapAndNumberedNeighbors() throws Exception {
    byte[] file =
        workbook(
            new String[] {null, "Drop", "Road 1", "true"},
            new String[] {null, "Keep", "Road 2", "false"},
            new String[] {null, "Keep", "Road  2", "true"},
            new String[] {"001", "Drop", "Road 1", "false"},
            new String[] {null, "Incomplete", "", "true"});
    upload(file, false);
    var plan = preview(file);
    assertThat(((Number) plan.get("deleteCount")).intValue()).isEqualTo(1);
    long drop =
        db.queryForObject(
            "select id from worksites where name='Drop' and consumer_number is null", Long.class);
    db.update(
        "insert into"
            + " inspections(site_id,phase,inspection_date,reading,worker_id,fee,settlement_status)"
            + " values(?,'START','2026-11-01',1,?,0,'CONFIRMED')",
        drop,
        actor);
    var protectedPlan = preview(file);
    assertThatThrownBy(() -> execute(protectedPlan))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("정산");
    db.update("update inspections set settlement_status='OPEN'");
    var ready = preview(file);
    assertThat(execute(ready).get("deleted")).isEqualTo(1);
    assertThat(db.queryForObject("select count(*) from worksites", Integer.class)).isEqualTo(2);
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where consumer_number='001'", Integer.class))
        .isEqualTo(1);
    assertThat(db.queryForObject("select count(*) from inspections", Integer.class)).isZero();
    assertThatThrownBy(() -> execute(ready)).isInstanceOf(ApiException.class);
  }

  @Test
  void visibleModeAndNullNumberDetailAndDocumentGenerationWork() throws Exception {
    byte[] file =
        workbook(
            new String[] {null, " Person A ", "Road 1", "true"},
            new String[] {null, "Person A", "Road 1", "false"});
    var result = upload(file, true);
    assertThat(result.inserted()).isEqualTo(1);
    assertThat(result.hiddenRows()).isEqualTo(1);
    assertThat(result.duplicateInFile()).isZero();
    long id = db.queryForObject("select id from worksites", Long.class);
    var siteService = new WorksiteService(new NamedParameterJdbcTemplate(ds), json);
    assertThat(siteService.detail(id, true).get("consumerNumber")).isNull();
    UUID job = documents.create(new DocumentService.Request(id, null, null, "Test"), actor);
    documents.tick();
    assertThat(documents.status(job, actor).get("status")).isEqualTo("READY");
    var out = new ByteArrayOutputStream();
    new ExcelExportService(db).write(out, null, null);
    try (var book = new XSSFWorkbook(new ByteArrayInputStream(out.toByteArray()))) {
      assertThat(book.getSheetAt(0).getRow(1).getCell(0)).isNull();
    }
  }
}
