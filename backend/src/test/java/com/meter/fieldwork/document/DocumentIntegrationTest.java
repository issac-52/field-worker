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
class DocumentIntegrationTest extends PostgresIntegrationTest {
  @Autowired DocumentService service;
  @Autowired JdbcTemplate db;
  @Autowired ObjectStorage storage;
  @Autowired PhotoService photos;
  @Autowired PhotoCleanup cleanup;
  @Autowired MockMvc mvc;
  @Autowired UserRepository users;
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
  void splitsJobsAndExpiresArtifacts() {
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
    assertThat(service.status(job, actor).get("status")).isEqualTo("QUEUED");
    // RUNNING is resumable after an interrupted process; committed parts are not repeated.
    db.update("update document_jobs set status='RUNNING' where id=?", job);
    service.tick();
    assertThat(service.status(job, actor).get("completed")).isEqualTo(51);
    assertThat((List<?>) service.status(job, actor).get("parts")).hasSize(2);
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
