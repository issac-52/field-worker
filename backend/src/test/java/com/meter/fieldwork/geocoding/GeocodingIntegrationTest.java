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
  void providerFailurePreservesSuccessfulRowsAndPausesWithoutCallingNextChunk() {
    long actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Test','unused','ADMIN')"
                + " returning id",
            Long.class,
            UUID.randomUUID().toString());
    UUID job = UUID.randomUUID();
    String block = UUID.randomUUID().toString();
    db.update("insert into import_jobs(id) values(?)", job);
    long after = db.queryForObject("select coalesce(max(id),0) from worksites", Long.class);
    for (int i = 0; i < 12; i++)
      db.update(
          "insert into"
              + " worksites(consumer_number,middle_block,address,source_cells,source_sheet,source_row,import_job_id)"
              + " values(?,?,?,'{}','Test',3,?)",
          UUID.randomUUID().toString(),
          block,
          "Failure road " + i,
          job);
    when(geocoder.find(anyString()))
        .thenReturn(new AddressGeocoder.Match(BigDecimal.ONE, BigDecimal.ONE, "Test"));
    doThrow(
            new com.meter.fieldwork.global.ApiException(
                502, "GEOCODING_UNAVAILABLE", "Test provider failure"))
        .when(geocoder)
        .find("Test region Failure road 1");
    var result =
        service.run(
            new GeocodingService.Request(after, null, "Test region", block, null, null), actor);
    assertThat(result.rows()).hasSize(10);
    assertThat(result.rows().stream().filter(r -> r.status().equals("UPDATED")).count())
        .isEqualTo(9);
    assertThat(result.rows().get(1).status()).isEqualTo("SERVICE_ERROR");
    assertThat(result.done()).isFalse();
    verify(geocoder, never()).find("Test region Failure road 10");
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where import_job_id=? and latitude is not null",
                Integer.class,
                job))
        .isEqualTo(9);
  }

  @Test
  void hundredRowBatchPreservesCoordinatesReportsNoMatchAndAuditsChanges() {
    long actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Test','unused','ADMIN')"
                + " returning id",
            Long.class,
            UUID.randomUUID().toString());
    UUID job = UUID.randomUUID();
    db.update("insert into import_jobs(id) values(?)", job);
    long after = db.queryForObject("select coalesce(max(id),0) from worksites", Long.class);
    for (int i = 0; i < 102; i++)
      db.update(
          "insert into"
              + " worksites(consumer_number,address,middle_block,source_cells,source_sheet,source_row,import_job_id)"
              + " values(?,?,'Test block','{}','Test',3,?)",
          UUID.randomUUID().toString(),
          "Test road " + i,
          job);
    long last = db.queryForObject("select max(id) from worksites", Long.class);
    db.update("update worksites set latitude=35,longitude=128 where id=?", last);
    var active = new java.util.concurrent.atomic.AtomicInteger();
    var peak = new java.util.concurrent.atomic.AtomicInteger();
    var concurrent = new java.util.concurrent.CountDownLatch(2);
    when(geocoder.find(anyString()))
        .thenAnswer(
            invocation -> {
              int count = active.incrementAndGet();
              peak.accumulateAndGet(count, Math::max);
              try {
                concurrent.countDown();
                assertThat(concurrent.await(2, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                return new AddressGeocoder.Match(
                    new BigDecimal("36.1"), new BigDecimal("128.2"), "Test");
              } finally {
                active.decrementAndGet();
              }
            });
    doReturn(null).when(geocoder).find("Test region Test road 1");
    var first =
        service.run(
            new GeocodingService.Request(after, last, "Test region", "Test block", null, null),
            actor);
    assertThat(first.rows()).hasSize(100);
    assertThat(peak.get()).isBetween(2, 10);
    assertThat(first.done()).isFalse();
    assertThat(first.rows().get(1).status()).isEqualTo("NO_MATCH");
    var second =
        service.run(
            new GeocodingService.Request(
                first.nextId(), last, "Test region", "Test block", null, null),
            actor);
    assertThat(second.rows()).hasSize(1);
    assertThat(second.done()).isTrue();
    assertThat(
            db.queryForObject("select latitude from worksites where id=?", BigDecimal.class, last))
        .isEqualByComparingTo("35");
    assertThat(
            db.queryForObject(
                "select count(*) from worksite_edits where actor_id=?", Integer.class, actor))
        .isEqualTo(100);
    verify(geocoder, never()).find("Test region Test road 101");
    long id = first.rows().getFirst().id();
    assertThat(sites.saveCoordinates(id, actor, "Test road 0", "", BigDecimal.ONE, BigDecimal.ONE))
        .isFalse();
  }

  @Test
  void filtersBlockAndKoreanRegistrationDayIncludingBothBoundaries() {
    UUID job = UUID.randomUUID();
    db.update("insert into import_jobs(id) values(?)", job);
    String block = UUID.randomUUID().toString();
    long after = db.queryForObject("select coalesce(max(id),0) from worksites", Long.class);
    String[] times = {
      "2026-11-06T14:59:59Z",
      "2026-11-06T15:00:00Z",
      "2026-11-07T14:59:59Z",
      "2026-11-07T15:00:00Z",
      "2026-11-07T00:00:00Z"
    };
    for (int i = 0; i < times.length; i++)
      db.update(
          "insert into"
              + " worksites(consumer_number,middle_block,address,source_cells,source_sheet,source_row,import_job_id,created_at)"
              + " values(?,?,?,'{}','Test',3,?,?::timestamptz)",
          UUID.randomUUID().toString(),
          i == 4 ? "Other block" : block,
          "Filter road " + i,
          job,
          times[i]);
    when(geocoder.find(anyString())).thenReturn(null);
    var date = java.time.LocalDate.of(2026, 11, 7);
    var result =
        service.run(new GeocodingService.Request(after, null, "Test region", block, date, date), 1);
    assertThat(result.rows()).hasSize(2).allMatch(row -> row.status().equals("NO_MATCH"));
    assertThat(result.done()).isTrue();
    var dateOnly =
        service.run(
            new GeocodingService.Request(
                after,
                db.queryForObject("select max(id) from worksites", Long.class),
                "Test region",
                null,
                date,
                date),
            1);
    assertThat(dateOnly.rows()).hasSize(3);
    verify(geocoder, times(2)).find("Test region Filter road 1");
    verify(geocoder, times(2)).find("Test region Filter road 2");
    verify(geocoder, never()).find("Test region Filter road 0");
    verify(geocoder, never()).find("Test region Filter road 3");
    verify(geocoder).find("Test region Filter road 4");
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where import_job_id=? and latitude is not null",
                Integer.class,
                job))
        .isZero();
  }

  @Test
  void requiresFilterAndRejectsReversedDatesBeforeProviderCall() {
    assertThatThrownBy(
            () ->
                service.run(
                    new GeocodingService.Request(0, null, "Test region", "", null, null), 1))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                service.run(
                    new GeocodingService.Request(
                        0,
                        null,
                        "Test region",
                        "",
                        java.time.LocalDate.of(2026, 11, 8),
                        java.time.LocalDate.of(2026, 11, 7)),
                    1))
        .isInstanceOf(IllegalArgumentException.class);
    verifyNoInteractions(geocoder);
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
