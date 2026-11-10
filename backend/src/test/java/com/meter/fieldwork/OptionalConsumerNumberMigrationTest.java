package com.meter.fieldwork;

import static org.assertj.core.api.Assertions.*;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class OptionalConsumerNumberMigrationTest extends PostgresIntegrationTest {
  @Test
  void upgradesExistingDatabaseWithoutChangingNumberedSitesAndEnforcesFallbackUniqueness() {
    String schema = "identity_migration_" + UUID.randomUUID().toString().replace("-", "");
    var ds =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl()
                + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
                + "currentSchema="
                + schema,
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    var db = new JdbcTemplate(ds);
    try {
      Flyway.configure()
          .dataSource(ds)
          .schemas(schema)
          .defaultSchema(schema)
          .target("11")
          .load()
          .migrate();
      UUID job = UUID.randomUUID();
      db.update("insert into import_jobs(id) values(?)", job);
      long existing =
          db.queryForObject(
              "insert into"
                  + " worksites(consumer_number,name,address,source_cells,source_sheet,source_row,import_job_id)"
                  + " values('001','Person A','Road 1','{}','Test',3,?) returning id",
              Long.class,
              job);
      Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).load().migrate();
      assertThat(
              db.queryForObject(
                  "select consumer_number from worksites where id=?", String.class, existing))
          .isEqualTo("001");
      String insert =
          "insert into"
              + " worksites(consumer_number,name,address,source_cells,source_sheet,source_row,import_job_id)"
              + " values(?,?,?,'{}','Test',3,?)";
      db.update(insert, null, "Person A", "Road 1", job);
      db.update(insert, null, "Person B", "Road 1", job);
      assertThatThrownBy(() -> db.update(insert, null, " Person A ", "Road  1", job))
          .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
      assertThatThrownBy(() -> db.update(insert, null, " ", "Road 1", job))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      assertThatThrownBy(() -> db.update(insert, "001", "Other", "Other road", job))
          .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
      assertThatThrownBy(() -> db.update(insert, "", "Other", "Other road", job))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      assertThat(db.queryForObject("select count(*) from worksites", Integer.class)).isEqualTo(3);
    } finally {
      db.execute("drop schema " + schema + " cascade");
    }
  }
}
