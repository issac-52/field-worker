package com.meter.fieldwork;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class RemoveMonthlyMigrationTest extends PostgresIntegrationTest {
  @Test
  void upgradeRemovesMonthlyCopiesButPreservesBasicDetailsAndNewInspections() {
    String schema = "upgrade_" + UUID.randomUUID().toString().replace("-", "");
    var ds =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl()
                + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
                + "currentSchema="
                + schema,
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    Flyway.configure()
        .dataSource(ds)
        .schemas(schema)
        .defaultSchema(schema)
        .target("7")
        .load()
        .migrate();
    var db = new JdbcTemplate(ds);
    try {
      UUID job = UUID.randomUUID();
      db.update("insert into import_jobs(id) values(?)", job);
      long actor =
          db.queryForObject(
              "insert into users(login_id,nickname,password,role)"
                  + " values('test','Test','unused','ADMIN') returning id",
              Long.class);
      long id =
          db.queryForObject(
              "insert into"
                  + " worksites(consumer_number,name,address,latitude,longitude,source_cells,source_sheet,source_row,import_job_id)"
                  + " values('001','Test name','Test address',35,128,'{\"D\":\"Test"
                  + " name\",\"J\":\"40\",\"L\":\"O\",\"M\":\"123\",\"Y\":\"10\",\"AK\":\"100\",\"AW\":\"999\",\"AX\":\"Test"
                  + " shop\"}','Test',3,?) returning id",
              Long.class,
              job);
      db.update(
          "insert into source_monthly_values(site_id,month,group_a) values(?,'2026-01-01','123')",
          id);
      db.update(
          "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee)"
              + " values(?,'START','2026-11-01',77,?,1000)",
          id,
          actor);
      Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).load().migrate();
      assertThat(
              db.queryForObject("select to_regclass('source_monthly_values')::text", String.class))
          .isNull();
      assertThat(
              db.queryForObject(
                  "select source_cells ??| array['M','Y','AK','AW'] from worksites where id=?",
                  Boolean.class,
                  id))
          .isFalse();
      assertThat(
              db.queryForObject(
                  "select source_cells->>'AX' from worksites where id=?", String.class, id))
          .isEqualTo("Test shop");
      assertThat(
              db.queryForObject(
                  "select source_cells->>'L' from worksites where id=?", String.class, id))
          .isEqualTo("O");
      assertThat(db.queryForObject("select name from worksites where id=?", String.class, id))
          .isEqualTo("Test name");
      assertThat(
              db.queryForObject(
                  "select reading from inspections where site_id=?", Integer.class, id))
          .isEqualTo(77);
      assertThat(db.queryForObject("select latitude from worksites where id=?", Integer.class, id))
          .isEqualTo(35);
    } finally {
      db.execute("drop schema " + schema + " cascade");
    }
  }
}
