package com.meter.fieldwork.performance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.document.*;
import com.zaxxer.hikari.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.testcontainers.containers.PostgreSQLContainer;

@Tag("performance")
class DocumentBatchPerformanceTest {
  @Test
  void compareThousandPhotoFreeCardsAtControlledStorageLatency() throws Exception {
    Path output = Path.of("build/performance/document-batches");
    Files.createDirectories(output);
    var json = new ObjectMapper().findAndRegisterModules();
    var results = new ArrayList<Map<String, Object>>();
    try (var pg = new PostgreSQLContainer<>("postgres:17-alpine")) {
      pg.start();
      var config = new HikariConfig();
      config.setJdbcUrl(pg.getJdbcUrl());
      config.setUsername(pg.getUsername());
      config.setPassword(pg.getPassword());
      config.setMaximumPoolSize(10);
      try (var pool = new HikariDataSource(config)) {
        Flyway.configure().dataSource(pool).load().migrate();
        var c = new PerformanceBaselineTest.Counters();
        var ds = PerformanceBaselineTest.counted(pool, c);
        var db = new JdbcTemplate(ds);
        var storage = new PerformanceBaselineTest.Storage(output.resolve("objects"), c, 10);
        var renderer =
            new HwpxCardRenderer() {
              @Override
              public byte[] render(
                  com.fasterxml.jackson.databind.JsonNode snapshot,
                  String title,
                  Map<String, byte[]> photos)
                  throws Exception {
                c.renderCalls.incrementAndGet();
                long start = System.nanoTime();
                try {
                  return super.render(snapshot, title, photos);
                } finally {
                  c.renderNs.addAndGet(System.nanoTime() - start);
                }
              }
            };
        UUID imp = UUID.randomUUID();
        db.update("insert into import_jobs(id) values(?)", imp);
        long actor =
            db.queryForObject(
                "insert into users(login_id,nickname,password,role) values('matrix','Fictional"
                    + " admin','unused','ADMIN') returning id",
                Long.class);
        db.update(
            "insert into"
                + " worksites(consumer_number,name,address,middle_block,source_cells,source_sheet,source_row,import_job_id)"
                + " select 'MATRIX-'||n,'Fictional site '||n,'Fictional road '||n,case when n<=50"
                + " then 'WARM' else 'REST' end,'{}','Synthetic',n+2,? from"
                + " generate_series(1,1000)n",
            imp);
        var warm =
            new DocumentService(
                db,
                storage,
                json,
                renderer,
                new DataSourceTransactionManager(ds),
                new DocumentBatchSettings(50, 1, 6));
        run(warm, actor, "Warmup", "WARM");
        int index = 0;
        for (int[] mode :
            new int[][] {{50, 1, 6}, {200, 1, 6}, {1000, 1, 6}, {200, 2, 0}, {1000, 2, 0}}) {
          var service =
              new DocumentService(
                  db,
                  storage,
                  json,
                  renderer,
                  new DataSourceTransactionManager(ds),
                  new DocumentBatchSettings(mode[0], mode[1], mode[2]));
          String title = String.format("Matrix %02d", ++index);
          for (String phase : List.of("first", "cached")) {
            long bytesBefore = objectBytes(output.resolve("objects"));
            c.reset();
            long start = System.nanoTime();
            int ticks = run(service, actor, title, null);
            double elapsed = (System.nanoTime() - start) / 1e6;
            var row = new LinkedHashMap<String, Object>();
            row.put("batchSize", mode[0]);
            row.put("parallelism", mode[1]);
            row.put("zipLevel", mode[2]);
            row.put("phase", phase);
            row.put("ticks", ticks);
            row.put("elapsedMs", elapsed);
            row.putAll(c.values());
            long pauseMs = index <= 3 ? 1000 : 100;
            row.put("modeledSchedulerWaitMs", (ticks - 1) * pauseMs);
            row.put("elapsedPlusModeledWaitMs", elapsed + (ticks - 1) * pauseMs);
            row.put("newStoredBytes", objectBytes(output.resolve("objects")) - bytesBefore);
            results.add(row);
          }
        }
        var env = new LinkedHashMap<String, Object>();
        env.put("generatedAt", ZonedDateTime.now(ZoneId.of("Asia/Seoul")).toString());
        env.put("sites", 1000);
        env.put("photosPerSite", 0);
        env.put("java", System.getProperty("java.version"));
        env.put("cpuQuota", Files.readString(Path.of("/sys/fs/cgroup/cpu.max")).strip());
        env.put("memoryLimit", Files.readString(Path.of("/sys/fs/cgroup/memory.max")).strip());
        env.put("maxHeapBytes", Runtime.getRuntime().maxMemory());
        env.put("storageLatencyPerOperationMs", 10);
        env.put("storage", "local filesystem with artificial 10ms delay; NOT real R2");
        env.put(
            "scope",
            "create + contiguous tick calls until READY; excludes actual scheduler delay, queue,"
                + " network and download; one job per configuration/phase; same new renderer in all"
                + " modes");
        env.put(
            "timers",
            "worker render/storage times are SUMS across concurrent workers and can exceed elapsed"
                + " wall time");
        Files.writeString(
            output.resolve("results.json"),
            json.writerWithDefaultPrettyPrinter()
                .writeValueAsString(Map.of("environment", env, "results", results)));
      }
    } finally {
      Path objects = output.resolve("objects");
      if (Files.exists(objects))
        try (var paths = Files.walk(objects)) {
          for (var p : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(p);
        }
    }
  }

  long objectBytes(Path root) throws Exception {
    try (var paths = Files.list(root)) {
      return paths
          .mapToLong(
              p -> {
                try {
                  return Files.size(p);
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
              })
          .sum();
    }
  }

  int run(DocumentService service, long actor, String title, String block) {
    UUID id = service.create(new DocumentService.Request(null, block, null, title), actor);
    int ticks = 0;
    while (true) {
      service.tick();
      var result = service.status(id, actor);
      if (++ticks > 100) throw new IllegalStateException("No progress");
      if (result.get("status").equals("READY")) return ticks;
      if (result.get("status").equals("FAILED"))
        throw new IllegalStateException("Failed matrix job");
    }
  }
}
