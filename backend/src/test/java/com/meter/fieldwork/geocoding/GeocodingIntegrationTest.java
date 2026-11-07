package com.meter.fieldwork.geocoding;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import com.meter.fieldwork.worksite.WorksiteService;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class GeocodingIntegrationTest extends PostgresIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired GeocodingService service;
  @Autowired WorksiteService sites;
  @Autowired MockMvc mvc;
  @MockitoBean AddressGeocoder geocoder;

  @Test
  void batchPreservesCoordinatesSkipsAmbiguousAndAuditsSuccessfulChanges() {
    long actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Test','unused','ADMIN')"
                + " returning id",
            Long.class,
            UUID.randomUUID().toString());
    UUID job = UUID.randomUUID();
    db.update("insert into import_jobs(id) values(?)", job);
    long after = db.queryForObject("select coalesce(max(id),0) from worksites", Long.class);
    for (int i = 0; i < 7; i++)
      db.update(
          "insert into"
              + " worksites(consumer_number,address,source_cells,source_sheet,source_row,import_job_id)"
              + " values(?,?,'{}','Test',3,?)",
          UUID.randomUUID().toString(),
          "Test road " + i,
          job);
    long last = db.queryForObject("select max(id) from worksites", Long.class);
    db.update("update worksites set latitude=35,longitude=128 where id=?", last);
    when(geocoder.find(anyString()))
        .thenReturn(
            new AddressGeocoder.Match(new BigDecimal("36.1"), new BigDecimal("128.2"), "Test"));
    when(geocoder.find("Test region Test road 1")).thenReturn(null);
    var first = service.run(new GeocodingService.Request(after, last, "Test region"), actor);
    assertThat(first.rows()).hasSize(5);
    assertThat(first.done()).isFalse();
    assertThat(first.rows().get(1).status()).isEqualTo("NO_UNIQUE_MATCH");
    var second =
        service.run(new GeocodingService.Request(first.nextId(), last, "Test region"), actor);
    assertThat(second.rows()).hasSize(1);
    assertThat(second.done()).isTrue();
    assertThat(
            db.queryForObject("select latitude from worksites where id=?", BigDecimal.class, last))
        .isEqualByComparingTo("35");
    assertThat(
            db.queryForObject(
                "select count(*) from worksite_edits where actor_id=?", Integer.class, actor))
        .isEqualTo(5);
    verify(geocoder, never()).find("Test region Test road 6");
    long id = first.rows().getFirst().id();
    assertThat(sites.saveCoordinates(id, actor, "Test road 0", "", BigDecimal.ONE, BigDecimal.ONE))
        .isFalse();
  }

  @Test
  void endpointRequiresAdminAndCsrf() throws Exception {
    mvc.perform(
            post("/api/admin/geocoding")
                .with(user("worker").roles("WORKER"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"afterId\":0,\"region\":\"Test region\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/admin/geocoding")
                .with(user("admin").roles("ADMIN"))
                .contentType("application/json")
                .content("{\"afterId\":0,\"region\":\"Test region\"}"))
        .andExpect(status().isForbidden());
  }
}
