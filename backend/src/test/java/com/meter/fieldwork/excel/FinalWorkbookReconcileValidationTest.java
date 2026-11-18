package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.assertThat;

import com.meter.fieldwork.PostgresIntegrationTest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

@Tag("manual-excel")
@EnabledIfEnvironmentVariable(named = "FIELDWORK_RECONCILE_PREVIOUS_XLSX", matches = ".+")
class FinalWorkbookReconcileValidationTest extends PostgresIntegrationTest {
  @Autowired ExcelImportService imports;
  @Autowired ExcelPruneService prune;
  @Autowired JdbcTemplate db;

  @Test
  void uploadedFinalWorkbookCanBeReconciledWithPreviousWorkbookInDisposableDatabase()
      throws Exception {
    Path previous = Path.of(System.getenv("FIELDWORK_RECONCILE_PREVIOUS_XLSX"));
    Path latest = Path.of(System.getenv("FIELDWORK_EXCEL_PATH"));
    long actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Test','unused','ADMIN')"
                + " returning id",
            Long.class,
            UUID.randomUUID().toString());
    try (var stream = Files.newInputStream(previous)) {
      var first = imports.importWorkbook(stream, actor, false, ExcelFormat.FINAL, true);
      assertThat(first.inserted()).isEqualTo(18541);
    }
    try (var stream = Files.newInputStream(latest)) {
      var update = imports.importWorkbook(stream, actor, false, ExcelFormat.FINAL, true);
      assertThat(update.inserted()).isEqualTo(1);
      assertThat(update.updated()).isZero();
      assertThat(update.unchanged()).isEqualTo(18307);
    }
    try (var stream = Files.newInputStream(latest)) {
      var plan = prune.previewMissingFromFinal(stream, actor);
      assertThat(plan).containsEntry("deleteCount", 215L).containsEntry("keepCount", 18327L);
      assertThat(prune.execute((UUID) plan.get("planId"), actor, (String) plan.get("confirmation")))
          .containsEntry("deleted", 215);
    }
    assertThat(db.queryForObject("select count(*) from worksites", Long.class)).isEqualTo(18327L);
    System.out.println("Previous 18541; inserted 1; updated 0; pruned 215; remaining 18327");
  }
}
