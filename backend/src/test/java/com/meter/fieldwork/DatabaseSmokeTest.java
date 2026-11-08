package com.meter.fieldwork;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class DatabaseSmokeTest extends PostgresIntegrationTest {
  @Autowired JdbcTemplate jdbc;

  @Test
  void postgresAndFlywayAreActuallyRunning() {
    assertThat(jdbc.queryForObject("select version()", String.class)).startsWith("PostgreSQL 17");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from flyway_schema_history where version='1' and success",
                Integer.class))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from information_schema.columns where table_name='users' and"
                    + " column_name='login_id' and table_schema=current_schema()",
                Integer.class))
        .isEqualTo(1);
  }
}
