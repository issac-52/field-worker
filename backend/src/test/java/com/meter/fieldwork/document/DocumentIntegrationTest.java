package com.meter.fieldwork.document;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.photo.*;
import com.meter.fieldwork.user.repository.UserRepository;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
@org.springframework.test.context.TestPropertySource(properties = "app.documents.batch-size=50")
class DocumentIntegrationTest extends PostgresIntegrationTest {
  @Autowired DocumentService service;
  @Autowired JdbcTemplate db;
  @Autowired ObjectStorage storage;
  @Autowired PhotoService photos;
  @Autowired PhotoCleanup cleanup;
  @Autowired MockMvc mvc;
  @Autowired UserRepository users;
  @org.springframework.test.context.bean.override.mockito.MockitoSpyBean HwpxCardRenderer renderer;
  long actor, site;
  UUID importId;
  String block;
  SessionUser principal;

  @BeforeEach
  void setup() {
    actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password) values(?,'Test"
                + " admin','unused','ADMIN',false) returning id",
            Long.class,
            UUID.randomUUID().toString());
    principal = new SessionUser(users.findById(actor).orElseThrow());
    importId = UUID.randomUUID();
    block = UUID.randomUUID().toString();
    db.update("insert into import_jobs(id) values(?)", importId);
    site =
        db.queryForObject(
            "insert into"
                + " worksites(consumer_number,name,address,middle_block,management_number,source_cells,source_sheet,source_row,import_job_id)"
                + " values(?,'가상 성명 & <테스트>','가상 도로 123',?,'TEST-001','{}','Test',3,?) returning"
                + " id",
            Long.class,
            UUID.randomUUID().toString(),
            block,
            importId);
  }

  @Test
  void defaultBatchCanFinishMoreThanFiftySmallCards() {
    db.update(
        "insert into"
            + " worksites(consumer_number,middle_block,source_cells,source_sheet,source_row,import_job_id)"
            + " select ?||n,?,'{}','Test',3,? from generate_series(1,50)n",
        UUID.randomUUID().toString(),
        block,
        importId);
    var generator =
        new DocumentService(
            db,
            storage,
            new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules(),
            renderer,
            new org.springframework.jdbc.datasource.DataSourceTransactionManager(
                db.getDataSource()));
    UUID job =
        generator.create(new DocumentService.Request(null, block, null, "Larger batch"), actor);
    generator.tick();
    assertThat(generator.status(job, actor).get("completed")).isEqualTo(51);
    assertThat(generator.status(job, actor).get("status")).isEqualTo("READY");
  }

  @Test
  void twoWorkersCanOverlapAndCancellationWaitsForThemBeforeCleanup() throws Exception {
    db.update(
        "insert into"
            + " worksites(consumer_number,middle_block,source_cells,source_sheet,source_row,import_job_id)"
            + " values(?,?,'{}','Test',3,?)",
        UUID.randomUUID().toString(),
        block,
        importId);
    UUID job =
        service.create(
            new DocumentService.Request(null, block, null, "Bounded parallel test"), actor);
    var entered = new java.util.concurrent.CountDownLatch(2);
    var release = new java.util.concurrent.CountDownLatch(1);
    org.mockito.Mockito.doAnswer(
            invocation -> {
              entered.countDown();
              if (!release.await(10, java.util.concurrent.TimeUnit.SECONDS))
                throw new IllegalStateException("test timeout");
              return invocation.callRealMethod();
            })
        .when(renderer)
        .render(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyMap());
    var running = java.util.concurrent.CompletableFuture.runAsync(() -> service.tick());
    try {
      assertThat(entered.await(3, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      service.cancel(job, actor);
      service.requestDelete(job, actor);
    } finally {
      release.countDown();
      running.get(10, java.util.concurrent.TimeUnit.SECONDS);
    }
    service.maintain();
    assertThat(
            db.queryForObject(
                "select count(*) from document_parts where job_id=?", Integer.class, job))
        .isZero();
    assertThat(
            db.queryForObject(
                "select count(*) from document_cache where site_id in (select id from worksites"
                    + " where middle_block=?)",
                Integer.class,
                block))
        .isZero();
    assertThatThrownBy(() -> service.status(job, actor)).isInstanceOf(ApiException.class);
  }

  @Test
  void byteThresholdStillSplitsLargeCardsWhenBatchLimitIsHigher() throws Exception {
    db.update(
        "insert into"
            + " worksites(consumer_number,middle_block,source_cells,source_sheet,source_row,import_job_id)"
            + " select ?||n,?,'{}','Test',3,? from generate_series(1,2)n",
        UUID.randomUUID().toString(),
        block,
        importId);
    byte[] payload = new byte[9 * 1024 * 1024];
    org.mockito.Mockito.doReturn(payload)
        .when(renderer)
        .render(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyMap());
    UUID job =
        service.create(new DocumentService.Request(null, block, null, "Byte cap test"), actor);
    service.tick();
    assertThat(service.status(job, actor).get("completed")).isEqualTo(2);
    assertThat(service.status(job, actor).get("status")).isEqualTo("QUEUED");
    service.tick();
    assertThat(service.status(job, actor).get("completed")).isEqualTo(3);
    assertThat(service.status(job, actor).get("status")).isEqualTo("READY");
    assertThat((List<?>) service.status(job, actor).get("parts")).hasSize(2);
  }

  @Test
  void cancellingDuringRenderDoesNotPublishOrRestartTheJob() throws Exception {
    UUID job = service.create(new DocumentService.Request(site, null, null, "Cancel test"), actor);
    var entered = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    org.mockito.Mockito.doAnswer(
            invocation -> {
              entered.countDown();
              if (!release.await(10, java.util.concurrent.TimeUnit.SECONDS))
                throw new IllegalStateException("test timeout");
              return invocation.callRealMethod();
            })
        .when(renderer)
        .render(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyMap());
    var running = java.util.concurrent.CompletableFuture.runAsync(() -> service.tick());
    try {
      assertThat(entered.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      service.cancel(job, actor);
      service.requestDelete(job, actor);
      assertThat(service.status(job, actor).get("status")).isEqualTo("DELETING");
    } finally {
      release.countDown();
    }
    running.get(10, java.util.concurrent.TimeUnit.SECONDS);
    assertThat(
            db.queryForObject(
                "select count(*) from document_parts where job_id=?", Integer.class, job))
        .isZero();
    service.maintain();
    assertThatThrownBy(() -> service.status(job, actor)).isInstanceOf(ApiException.class);
    assertThat(
            db.queryForObject(
                "select count(*) from document_cache where site_id=?", Integer.class, site))
        .isZero();
  }

  @Test
  void cancelsQueuedJobAndDeletesItsResultsWithoutDeletingSharedCache() throws Exception {
    var request = new DocumentService.Request(site, null, null, "Test");
    UUID first = service.create(request, actor);
    UUID duplicate = service.create(request, actor);
    mvc.perform(
            post("/api/exports/cards/" + duplicate + "/cancel").with(user(principal)).with(csrf()))
        .andExpect(status().isOk());
    assertThat(service.status(duplicate, actor).get("status")).isEqualTo("CANCELLED");
    service.tick();
    assertThat(service.status(first, actor).get("status")).isEqualTo("READY");
    String cache =
        db.queryForObject(
            "select object_key from document_cache where site_id=?", String.class, site);
    String part =
        db.queryForObject(
            "select object_key from document_parts where job_id=?", String.class, first);
    mvc.perform(delete("/api/exports/cards/" + first).with(user(principal)).with(csrf()))
        .andExpect(status().isOk());
    service.tick();
    assertThatThrownBy(() -> service.status(first, actor)).isInstanceOf(ApiException.class);
    assertThat(
            db.queryForObject(
                "select count(*) from document_cache where site_id=?", Integer.class, site))
        .isEqualTo(1);
    cleanup.cleanup();
    assertThatThrownBy(() -> storage.get(part)).isInstanceOf(RuntimeException.class);
    assertThat(storage.get(cache)).isNotEmpty();
    mvc.perform(delete("/api/exports/cards/" + duplicate).with(user(principal)).with(csrf()))
        .andExpect(status().isOk());
    service.maintain();
    cleanup.cleanup();
    assertThat(
            db.queryForObject(
                "select count(*) from document_cache where site_id=?", Integer.class, site))
        .isZero();
    assertThatThrownBy(() -> storage.get(cache)).isInstanceOf(RuntimeException.class);
  }

  @Test
  void createsReadableHwpxCachesItAndRejectsOldZipAfterPhotoDeletion() throws Exception {
    var image = new BufferedImage(200, 120, BufferedImage.TYPE_INT_RGB);
    var out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    photos.upload(site, PhotoService.Slot.OVERVIEW, out.toByteArray(), actor, null, true);
    photos.upload(site, PhotoService.Slot.START_CLOSEUP, out.toByteArray(), actor, null, true);
    photos.upload(site, PhotoService.Slot.END_CLOSEUP, out.toByteArray(), actor, null, true);
    db.update(
        "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee)"
            + " values(?,'START','2026-11-01',100,?,0),(?,'END','2027-11-01',125,?,0)",
        site,
        actor,
        site,
        actor);
    var request = new DocumentService.Request(site, null, null, "가상군 성과측정");
    UUID job = service.create(request, actor);
    assertThat(service.status(job, actor).get("status")).isEqualTo("QUEUED");
    service.tick();
    assertThat(service.status(job, actor).get("status")).isEqualTo("READY");
    byte[] card = unzip(service.download(job, 1, actor)).values().iterator().next();
    var entries = unzip(card);
    String xml =
        new String(entries.get("Contents/section0.xml"), java.nio.charset.StandardCharsets.UTF_8);
    assertThat(xml)
        .contains("가상 성명 &amp; &lt;테스트&gt;", "125 ㎥", "100 ㎥", "25 ㎥")
        .doesNotContain("OO군", "0.000 ㎥");
    assertThat(entries.keySet().stream().filter(n -> n.startsWith("BinData/")).count())
        .isEqualTo(3);
    var doc = HwpxCardRenderer.xml(entries.get("Contents/section0.xml"));
    assertThat(doc.getElementsByTagNameNS(HwpxCardRenderer.HP, "pic").getLength()).isEqualTo(3);
    // Verify that an independent HWPX reader accepts the generated package.
    Path path = Files.createTempFile("fictional-card-", ".hwpx");
    try {
      Files.write(path, card);
      assertThat(kr.dogfoot.hwpxlib.reader.HWPXReader.fromFile(path.toFile())).isNotNull();
    } finally {
      Files.deleteIfExists(path);
    }
    Path sample = Path.of("build/validation/fictional-inspection-card.hwpx");
    Files.createDirectories(sample.getParent());
    Files.write(sample, card);
    UUID repeat = service.create(request, actor);
    service.tick();
    assertThat(unzip(service.download(repeat, 1, actor)).values().iterator().next())
        .isEqualTo(card);
    assertThat(
            db.queryForObject(
                "select count(*) from document_cache where site_id=?", Integer.class, site))
        .isEqualTo(1);
    var photo =
        db.queryForMap(
            "select id,object_key from photos where site_id=? and slot='OVERVIEW'", site);
    String key = (String) photo.get("object_key");
    photos.delete(site, ((Number) photo.get("id")).longValue(), actor, true);
    assertThat(storage.get(key)).isNotEmpty(); // Deletion is queued, not synchronous.
    assertThatThrownBy(() -> service.download(job, 1, actor))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("변경");
    assertThatThrownBy(() -> service.checkWholeDownload(job, actor))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("변경");
    cleanup.cleanup();
    assertThatThrownBy(() -> storage.get(key)).isInstanceOf(RuntimeException.class);
    assertThat(
            db.queryForObject(
                "select count(*) from photo_deletions where object_key=?", Integer.class, key))
        .isZero();
    UUID changed = service.create(request, actor);
    service.tick();
    byte[] newCard = unzip(service.download(changed, 1, actor)).values().iterator().next();
    assertThat(unzip(newCard).keySet().stream().filter(n -> n.startsWith("BinData/")).count())
        .isEqualTo(2);
  }

  @Test
  void splitsJobsAndExpiresArtifacts() throws Exception {
    db.update(
        "insert into"
            + " worksites(consumer_number,middle_block,source_cells,source_sheet,source_row,import_job_id)"
            + " select ?||n::text,?,'{}','Test',3,? from generate_series(1,50)n",
        UUID.randomUUID().toString(),
        block,
        importId);
    UUID job = service.create(new DocumentService.Request(null, block, null, "가상군"), actor);
    service.tick();
    assertThat(service.status(job, actor).get("completed")).isEqualTo(50);
    assertThatThrownBy(() -> service.checkWholeDownload(job, actor))
        .isInstanceOf(ApiException.class);
    assertThat(service.status(job, actor).get("status")).isEqualTo("QUEUED");
    // RUNNING is resumable after an interrupted process; committed parts are not repeated.
    db.update("update document_jobs set status='RUNNING' where id=?", job);
    service.tick();
    assertThat(service.status(job, actor).get("completed")).isEqualTo(51);
    assertThat((List<?>) service.status(job, actor).get("parts")).hasSize(2);
    var combined = new ByteArrayOutputStream();
    service.writeWholeZip(job, actor, combined);
    assertThat(unzip(combined.toByteArray()).keySet())
        .containsExactlyElementsOf(
            db
                .queryForList(
                    "select id from worksites where middle_block=? order by id", Long.class, block)
                .stream()
                .map(id -> "site-" + id + ".hwpx")
                .toList());
    assertThat(unzip(combined.toByteArray()))
        .hasSize(51)
        .allSatisfy(
            (name, bytes) -> {
              assertThat(name).endsWith(".hwpx");
              assertThat(bytes).startsWith((byte) 'P', (byte) 'K');
            });
    mvc.perform(get("/api/exports/cards/" + job + "/download").with(user(principal)))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "application/zip"))
        .andExpect(header().string("Cache-Control", "no-store"));

    db.update("update document_jobs set expires_at=now()-interval '1 second' where id=?", job);
    db.update(
        "update document_artifacts set expires_at=now()-interval '1 second' where object_key in"
            + " (select object_key from document_parts where job_id=?)",
        job);
    service.tick();
    assertThatThrownBy(() -> service.status(job, actor)).isInstanceOf(ApiException.class);
    assertThat(
            db.queryForObject(
                "select count(*) from document_parts where job_id=?", Integer.class, job))
        .isZero();
  }

  @Test
  void enforcesAdminCsrfAndJobOwnership() throws Exception {
    mvc.perform(
            post("/api/exports/cards")
                .with(user("worker").roles("WORKER"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"title\":\"Test\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/exports/cards")
                .with(user(principal))
                .contentType("application/json")
                .content("{\"title\":\"Test\"}"))
        .andExpect(status().isForbidden());
    UUID job = service.create(new DocumentService.Request(site, null, null, "Test"), actor);
    assertThatThrownBy(() -> service.cancel(job, actor + 100000)).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> service.requestDelete(job, actor + 100000))
        .isInstanceOf(ApiException.class);
    mvc.perform(post("/api/exports/cards/" + job + "/cancel").with(user(principal)))
        .andExpect(status().isForbidden());
    mvc.perform(delete("/api/exports/cards/" + job).with(user(principal)))
        .andExpect(status().isForbidden());

    assertThatThrownBy(() -> service.status(job, actor + 100000)).isInstanceOf(ApiException.class);
    mvc.perform(get("/api/exports/cards/" + job).with(user(principal)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.total").value(1));
    service.tick();
  }

  private static Map<String, byte[]> unzip(byte[] bytes) throws Exception {
    var result = new LinkedHashMap<String, byte[]>();
    try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
      for (ZipEntry e; (e = zip.getNextEntry()) != null; )
        result.put(e.getName(), zip.readAllBytes());
    }
    return result;
  }
}
