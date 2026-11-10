package com.meter.fieldwork.performance;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.PostgresIntegrationTest;
import com.meter.fieldwork.worksite.WorksiteService;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

class ListQueryRegressionTest extends PostgresIntegrationTest {
  @Autowired ObjectMapper json;
  @Autowired javax.sql.DataSource raw;
  WorksiteService service;
  JdbcTemplate db;
  TransactionTemplate tx;
  PerformanceBaselineTest.Counters counter;
  String block;
  long actor;
  UUID job;

  @BeforeEach
  void setup() {
    counter = new PerformanceBaselineTest.Counters();
    var counted = PerformanceBaselineTest.counted(raw, counter);
    db = new JdbcTemplate(counted);
    service = new WorksiteService(new NamedParameterJdbcTemplate(counted), json);
    tx = new TransactionTemplate(new DataSourceTransactionManager(counted));
    tx.setReadOnly(true);
    block = UUID.randomUUID().toString();
    job = UUID.randomUUID();
    actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Fictional"
                + " worker','unused','WORKER') returning id",
            Long.class,
            block);
    db.update("insert into import_jobs(id) values(?)", job);
    for (int n = 0; n < 25; n++) {
      long id =
          db.queryForObject(
              "insert into"
                  + " worksites(consumer_number,middle_block,name,address,management_number,source_cells,source_sheet,source_row,import_job_id,special_condition,special_description)"
                  + " values(?,?,'Fictional site','Fictional"
                  + " road',?,'{\"AZ\":\"0012\",\"J\":\"15\"}','Test',3,?,'OTHER','Test condition')"
                  + " returning id",
              Long.class,
              n == 0 ? null : block + n,
              block,
              String.format("%03d", n),
              job);
      if (n % 2 == 0)
        db.update(
            "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee)"
                + " values(?,'START','2026-01-01',100,?,1500)",
            id,
            actor);
      if (n % 4 == 0)
        db.update(
            "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee)"
                + " values(?,'END','2027-01-01',120,?,1700)",
            id,
            actor);
      for (int p = 0; p < n % 3; p++)
        db.update(
            "insert into photos(site_id,slot,object_key,content_type,size_bytes,uploaded_by)"
                + " values(?,? ,?,'image/png',1,?)",
            id,
            p == 0 ? "OVERVIEW" : "TEMPORARY",
            UUID.randomUUID().toString(),
            actor);
    }
  }

  @AfterEach
  void clean() {
    db.update(
        "delete from photos where site_id in (select id from worksites where import_job_id=?)",
        job);
    db.update(
        "delete from inspections where site_id in (select id from worksites where import_job_id=?)",
        job);
    db.update("delete from worksites where import_job_id=?", job);
    db.update("delete from import_jobs where id=?", job);
    db.update("delete from users where id=?", actor);
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(ints = {1, 20, 100})
  void queryCountDoesNotGrowWithPageSize(int size) {
    counter.reset();
    var result =
        tx.execute(
            s -> service.page(new WorksiteService.Filter(block, null, null, null), 1, size, true));
    assertThat((List<?>) result.get("items")).hasSize(Math.min(size, 25));
    assertThat(counter.sql.get()).isLessThanOrEqualTo(4);
  }

  @Test
  @SuppressWarnings("unchecked")
  void pageMatchesDetailForBothRolesAndPreservesFiltersOrderAndEmptyResponses() {
    for (boolean admin : new boolean[] {false, true}) {
      var result =
          tx.execute(
              s -> service.page(new WorksiteService.Filter(block, null, null, null), 2, 20, admin));
      var items = (List<Map<String, Object>>) result.get("items");
      assertThat(items).hasSize(5);
      assertThat(result.get("page")).isEqualTo(2);
      for (var item : items) {
        var expected = service.detail(((Number) item.get("id")).longValue(), admin);
        expected.put("photoCount", ((List<?>) expected.remove("photos")).size());
        expected.remove("note");
        assertThat(item).isEqualTo(expected);
      }
      assertThat(items.stream().map(m -> m.get("managementNo")))
          .containsExactly("020", "021", "022", "023", "024");
      var filtered =
          tx.execute(
              s ->
                  service.page(
                      new WorksiteService.Filter(block, null, "Fictional", "DONE"),
                      999,
                      20,
                      admin));
      assertThat(filtered.get("page")).isEqualTo(1);
      assertThat(((List<?>) filtered.get("items"))).hasSize(7);
      for (var item : (List<Map<String, Object>>) filtered.get("items")) {
        var records = (Map<String, Map<String, Object>>) item.get("inspections");
        assertThat(records.get("END").containsKey("fee")).isEqualTo(admin);
        assertThat(records.get("END").containsKey("settlementStatus")).isEqualTo(admin);
      }
      var first =
          tx.execute(
              s -> service.page(new WorksiteService.Filter(block, null, null, null), 1, 1, admin));
      assertThat(((List<Map<String, Object>>) first.get("items")).getFirst().get("consumerNumber"))
          .isNull();
    }
    counter.reset();
    var empty =
        tx.execute(
            s ->
                service.page(
                    new WorksiteService.Filter(block, null, "not present", null), 1, 100, true));
    assertThat((List<?>) empty.get("items")).isEmpty();
    assertThat(counter.sql.get()).isLessThanOrEqualTo(2);
  }
}
