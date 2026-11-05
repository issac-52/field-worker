package com.meter.fieldwork.worksite;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.user.repository.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class WorksiteIntegrationTest extends PostgresIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired UserRepository users;
  SessionUser actor;
  long site;
  String number;

  @BeforeEach
  void setup() {
    String key = UUID.randomUUID().toString();
    number = "site-" + key;
    long id =
        jdbc.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password)"
                + " values(?,?,'unused','WORKER',false) returning id",
            Long.class,
            key,
            "Fictional Worker");
    actor = new SessionUser(users.findById(id).orElseThrow());
    UUID job = UUID.randomUUID();
    jdbc.update("insert into import_jobs(id) values(?)", job);
    site =
        jdbc.queryForObject(
            "insert into"
                + " worksites(consumer_number,name,address,middle_block,small_block,source_cells,source_sheet,source_row,import_job_id)"
                + " values(?,'Fictional site','Test address','M1','S1','{}','Test',3,?) returning"
                + " id",
            Long.class,
            number,
            job);
  }

  @Test
  void searchAndDetailUseBoundedPagesAndNullCoordinates() throws Exception {
    mvc.perform(
            get("/api/sites")
                .param("q", number)
                .param("page", "999")
                .param("pageSize", "1")
                .with(user(actor)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.total").value(1))
        .andExpect(jsonPath("$.data.page").value(1))
        .andExpect(jsonPath("$.data.items[0].consumerNumber").value(number))
        .andExpect(jsonPath("$.data.items[0].latitude").isEmpty());
    mvc.perform(get("/api/sites/" + site).with(user(actor)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("Fictional site"))
        .andExpect(jsonPath("$.data.inspections").isEmpty());
  }

  @Test
  void specialConditionCanBeSavedWithoutReadingAndHasAudit() throws Exception {
    mvc.perform(
            patch("/api/sites/" + site + "/special-condition")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content("{\"code\":\"HOPE\",\"description\":\"\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.specialCondition.code").value("HOPE"))
        .andExpect(jsonPath("$.data.specialCondition.label").value("호폐"));
    mvc.perform(
            patch("/api/sites/" + site + "/special-condition")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content("{\"code\":\"OTHER\",\"description\":\"Fictional detail\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.specialCondition.description").value("Fictional detail"));
    assertThat(
            jdbc.queryForObject(
                "select count(*) from worksite_edits where site_id=?", Integer.class, site))
        .isEqualTo(2);
  }

  @Test
  void invalidConditionAndMissingSiteAreRejected() throws Exception {
    mvc.perform(
            patch("/api/sites/" + site + "/special-condition")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content("{\"code\":\"UNKNOWN\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/sites/0").with(user(actor))).andExpect(status().isNotFound());
  }

  @Test
  void independentEndThenStartValidatesUsageAndConcurrentCorrection() throws Exception {
    mvc.perform(
            post("/api/sites/" + site + "/measurements")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"phase\":\"END\",\"date\":\"2027-01-05\",\"reading\":150,\"workerId\":"
                        + actor.id()
                        + "}"))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/sites/" + site + "/measurements")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"phase\":\"START\",\"date\":\"2026-11-05\",\"reading\":200,\"workerId\":"
                        + actor.id()
                        + "}"))
        .andExpect(status().isBadRequest());
    String response =
        mvc.perform(
                post("/api/sites/" + site + "/measurements")
                    .with(user(actor))
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        "{\"phase\":\"START\",\"date\":\"2026-11-05\",\"reading\":100,\"workerId\":"
                            + actor.id()
                            + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.usage").value(50))
            .andExpect(jsonPath("$.data.inspections.START.fee").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String version =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(response)
            .at("/data/inspections/START/updatedAt")
            .asText();
    String body =
        "{\"date\":\"2026-11-06\",\"reading\":110,\"expectedUpdatedAt\":\"" + version + "\"}";
    mvc.perform(
            patch("/api/sites/" + site + "/measurements/START")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.usage").value(40));
    mvc.perform(
            patch("/api/sites/" + site + "/measurements/START")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isConflict());
    assertThat(
            jdbc.queryForObject(
                "select count(*) from inspection_edits where site_id=?", Integer.class, site))
        .isEqualTo(3);
    mvc.perform(get("/api/sites/" + site + "/measurements/START/history").with(user(actor)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(2))
        .andExpect(jsonPath("$.data.items[0].after.fee").doesNotExist());
  }

  @Test
  void cannotCreateForAnotherWorkerOrEditAnotherWorkersRecord() throws Exception {
    mvc.perform(
            post("/api/sites/" + site + "/measurements")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"phase\":\"START\",\"date\":\"2026-11-05\",\"reading\":100,\"workerId\":1}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void sixPhotosAreAllowedAndSeventhIsRejected() throws Exception {
    var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var out = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", out);
    for (String slot :
        new String[] {
          "OVERVIEW", "START_CLOSEUP", "END_CLOSEUP", "TEMPORARY", "EXTRA_1", "EXTRA_2"
        }) {
      var file =
          new org.springframework.mock.web.MockMultipartFile(
              "file", "test.png", "image/png", out.toByteArray());
      mvc.perform(
              multipart("/api/sites/" + site + "/photos")
                  .file(file)
                  .param("slot", slot)
                  .with(user(actor))
                  .with(csrf()))
          .andExpect(status().isOk());
    }
    var seventh =
        new org.springframework.mock.web.MockMultipartFile(
            "file", "test.png", "image/png", out.toByteArray());
    mvc.perform(
            multipart("/api/sites/" + site + "/photos")
                .file(seventh)
                .param("slot", "OVERVIEW")
                .with(user(actor))
                .with(csrf()))
        .andExpect(status().isConflict());
    mvc.perform(get("/api/sites/" + site).with(user(actor)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.photos.length()").value(6));
    Long photo =
        jdbc.queryForObject(
            "select id from photos where site_id=? order by id limit 1", Long.class, site);
    mvc.perform(get("/api/sites/" + site + "/photos/" + photo + "/content").with(user(actor)))
        .andExpect(status().isOk())
        .andExpect(content().contentType("image/png"));
    mvc.perform(delete("/api/sites/" + site + "/photos/" + photo).with(user(actor)).with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/sites/" + site).with(user(actor)))
        .andExpect(jsonPath("$.data.photos.length()").value(5));
  }

  @Test
  void fakeImageIsRejected() throws Exception {
    var file =
        new org.springframework.mock.web.MockMultipartFile(
            "file", "fake.png", "image/png", new byte[] {1, 2, 3});
    mvc.perform(
            multipart("/api/sites/" + site + "/photos")
                .file(file)
                .param("slot", "OVERVIEW")
                .with(user(actor))
                .with(csrf()))
        .andExpect(status().isBadRequest());
  }

  @Test
  void ratesDoNotRewriteSnapshotsAndPaidSettlementCannotBeAdjusted() throws Exception {
    long adminId =
        jdbc.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password) values(?,'Test"
                + " Admin','unused','ADMIN',false) returning id",
            Long.class,
            UUID.randomUUID().toString());
    var admin = new SessionUser(users.findById(adminId).orElseThrow());
    String created =
        mvc.perform(
                post("/api/fee-rules")
                    .with(user(admin))
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        "{\"phase\":\"START\",\"startDate\":\"2026-01-01\",\"endDate\":\"2026-12-31\",\"amount\":1000}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long rule =
        new com.fasterxml.jackson.databind.ObjectMapper().readTree(created).at("/data/id").asLong();
    mvc.perform(
            post("/api/sites/" + site + "/measurements")
                .with(user(actor))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"phase\":\"START\",\"date\":\"2026-11-05\",\"reading\":100,\"workerId\":"
                        + actor.id()
                        + "}"))
        .andExpect(status().isOk());
    mvc.perform(
            patch("/api/fee-rules/" + rule)
                .with(user(admin))
                .with(csrf())
                .contentType("application/json")
                .content("{\"amount\":2000}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/sites/" + site).with(user(admin)))
        .andExpect(jsonPath("$.data.inspections.START.fee").value(1000));
    long inspection =
        jdbc.queryForObject("select id from inspections where site_id=?", Long.class, site);
    String ids = "{\"inspectionIds\":[" + inspection + "]}";
    mvc.perform(
            post("/api/admin/settlements/confirm")
                .with(user(admin))
                .with(csrf())
                .contentType("application/json")
                .content(ids))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/admin/settlements/pay")
                .with(user(admin))
                .with(csrf())
                .contentType("application/json")
                .content(ids))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/admin/fee-adjustments")
                .with(user(admin))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"phase\":\"START\",\"startDate\":\"2026-01-01\",\"endDate\":\"2026-12-31\",\"amount\":3000,\"reason\":\"Test"
                        + " adjustment\"}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/settlements").param("workerId", actor.id().toString()).with(user(admin)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.summary.totalFee").value(1000))
        .andExpect(jsonPath("$.data.items[0].settlementStatus").value("PAID"));
    mvc.perform(get("/api/settlements").with(user(actor))).andExpect(status().isForbidden());
  }

  @Test
  void excelExportIsRealXlsxAndAdminOnly() throws Exception {
    mvc.perform(get("/api/exports/sites.xlsx").with(user(actor))).andExpect(status().isForbidden());
    long adminId =
        jdbc.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password)"
                + " values(?,'Export Admin','unused','ADMIN',false) returning id",
            Long.class,
            UUID.randomUUID().toString());
    var admin = new SessionUser(users.findById(adminId).orElseThrow());
    var pending =
        mvc.perform(get("/api/exports/sites.xlsx").with(user(admin)))
            .andExpect(request().asyncStarted())
            .andReturn();
    var result = mvc.perform(asyncDispatch(pending)).andExpect(status().isOk()).andReturn();
    try (var workbook =
        new org.apache.poi.xssf.usermodel.XSSFWorkbook(
            new java.io.ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
      assertThat(workbook.getSheetAt(0).getLastRowNum()).isGreaterThanOrEqualTo(1);
      assertThat(workbook.getSheetAt(0).getRow(0).getCell(0).getStringCellValue())
          .isEqualTo("수용가번호");
    }
  }

  @Test
  void anotherWorkerCannotCorrectAnExistingInspection() throws Exception {
    String response =
        mvc.perform(
                post("/api/sites/" + site + "/measurements")
                    .with(user(actor))
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        "{\"phase\":\"START\",\"date\":\"2026-11-05\",\"reading\":100,\"workerId\":"
                            + actor.id()
                            + "}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String version =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(response)
            .at("/data/inspections/START/updatedAt")
            .asText();
    long otherId =
        jdbc.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password)"
                + " values(?,'Other worker','unused','WORKER',false) returning id",
            Long.class,
            UUID.randomUUID().toString());
    var other = new SessionUser(users.findById(otherId).orElseThrow());
    mvc.perform(
            patch("/api/sites/" + site + "/measurements/START")
                .with(user(other))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"date\":\"2026-11-06\",\"reading\":110,\"expectedUpdatedAt\":\""
                        + version
                        + "\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/fee-rules").with(user(other))).andExpect(status().isForbidden());
  }

  @Test
  void consumerNumberAndWaterSupplyNumberAreNotConflated() throws Exception {
    jdbc.update(
        "update worksites set source_cells='{\"AZ\":\"SUPPLY-TEST\"}'::jsonb where id=?", site);
    mvc.perform(get("/api/sites/" + site).with(user(actor)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.consumerNumber").value(number))
        .andExpect(jsonPath("$.data.waterNo").value("SUPPLY-TEST"));
  }
}
