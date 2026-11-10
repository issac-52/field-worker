package com.meter.fieldwork.performance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.document.*;
import com.meter.fieldwork.photo.ObjectStorage;
import com.meter.fieldwork.worksite.*;
import com.zaxxer.hikari.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.imageio.ImageIO;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

@Tag("performance")
class PerformanceBaselineTest {
  static class Counters {
    final AtomicLong renderCalls = new AtomicLong(), renderNs = new AtomicLong();
    final AtomicLong sql = new AtomicLong(),
        batch = new AtomicLong(),
        sqlNs = new AtomicLong(),
        gets = new AtomicLong(),
        puts = new AtomicLong(),
        ioNs = new AtomicLong();

    void reset() {
      renderCalls.set(0);
      renderNs.set(0);
      sql.set(0);
      batch.set(0);
      sqlNs.set(0);
      gets.set(0);
      puts.set(0);
      ioNs.set(0);
    }

    Map<String, Object> values() {
      return Map.of(
          "renderCalls",
          renderCalls.get(),
          "renderMs",
          renderNs.get() / 1e6,
          "jdbcExecutions",
          sql.get(),
          "jdbcBatchCalls",
          batch.get(),
          "jdbcExecuteMs",
          sqlNs.get() / 1e6,
          "storageGets",
          gets.get(),
          "storagePuts",
          puts.get(),
          "storageIoMs",
          ioNs.get() / 1e6);
    }
  }

  static Object invoke(Object target, Method method, Object[] args) throws Throwable {
    try {
      return method.invoke(target, args);
    } catch (InvocationTargetException ex) {
      throw ex.getCause();
    }
  }

  static DataSource counted(DataSource delegate, Counters c) {
    return new AbstractDataSource() {
      public Connection getConnection() throws SQLException {
        return wrap(delegate.getConnection());
      }

      public Connection getConnection(String user, String password) throws SQLException {
        return wrap(delegate.getConnection(user, password));
      }

      Connection wrap(Connection connection) {
        return (Connection)
            Proxy.newProxyInstance(
                getClass().getClassLoader(),
                new Class[] {Connection.class},
                (proxy, method, args) -> {
                  Object value = invoke(connection, method, args);
                  if (value instanceof Statement statement) {
                    Class<?> type =
                        value instanceof CallableStatement
                            ? CallableStatement.class
                            : value instanceof PreparedStatement
                                ? PreparedStatement.class
                                : Statement.class;
                    return Proxy.newProxyInstance(
                        getClass().getClassLoader(),
                        new Class[] {type},
                        (p, m, a) -> {
                          if (!m.getName().startsWith("execute")) return invoke(statement, m, a);
                          c.sql.incrementAndGet();
                          if (m.getName().contains("Batch")) c.batch.incrementAndGet();
                          long t = System.nanoTime();
                          try {
                            return invoke(statement, m, a);
                          } finally {
                            c.sqlNs.addAndGet(System.nanoTime() - t);
                          }
                        });
                  }
                  return value;
                });
      }
    };
  }

  static class Storage implements ObjectStorage {
    final Path root;
    final Counters c;
    final int latencyMs;

    Storage(Path root, Counters c, int latencyMs) throws Exception {
      this.root = root;
      this.c = c;
      this.latencyMs = latencyMs;
      Files.createDirectories(root);
    }

    void delay() throws InterruptedException {
      if (latencyMs > 0) Thread.sleep(latencyMs);
    }

    public void put(String key, byte[] bytes, String type) {
      c.puts.incrementAndGet();
      long t = System.nanoTime();
      try {
        delay();
        Files.write(root.resolve(key), bytes);
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      } finally {
        c.ioNs.addAndGet(System.nanoTime() - t);
      }
    }

    public byte[] get(String key) {
      c.gets.incrementAndGet();
      long t = System.nanoTime();
      try {
        delay();
        return Files.readAllBytes(root.resolve(key));
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      } finally {
        c.ioNs.addAndGet(System.nanoTime() - t);
      }
    }

    public void delete(String key) {
      try {
        Files.deleteIfExists(root.resolve(key));
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      }
    }
  }

  interface Work {
    Object run() throws Exception;
  }

  final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
  final List<Map<String, Object>> results = new ArrayList<>();

  void measure(String name, int warmup, int samples, Counters c, Work work) throws Exception {
    for (int i = 0; i < warmup; i++) work.run();
    c.reset();
    var times = new ArrayList<Double>();
    int bytes = 0;
    for (int i = 0; i < samples; i++) {
      long t = System.nanoTime();
      Object value = work.run();
      bytes = json.writeValueAsBytes(value).length;
      times.add((System.nanoTime() - t) / 1e6);
    }
    var sorted = times.stream().sorted().toList();
    var row = new LinkedHashMap<String, Object>();
    row.put("name", name);
    row.put("samples", samples);
    row.put("p50Ms", sorted.get((samples - 1) / 2));
    row.put("p95Ms", sorted.get((int) Math.ceil(samples * .95) - 1));
    row.put("meanMs", times.stream().mapToDouble(Double::doubleValue).average().orElse(0));
    row.put("responseBytes", bytes);
    row.putAll(c.values());
    row.put("jdbcExecutionsPerOperation", c.sql.get() / (double) samples);
    results.add(row);
  }

  @Test
  void rendererWithoutPhotos() throws Exception {
    var c = new Counters();
    var renderer = new HwpxCardRenderer();
    var snapshot =
        json.readTree(
            "{\"site\":{\"name\":\"Fictional site\",\"address\":\"Fictional road"
                + " 1\",\"consumer_number\":\"PERF-001\",\"management_number\":\"PERF-001\",\"industry\":\"Test\"},\"inspections\":[{\"phase\":\"START\",\"inspection_date\":\"2026-01-01\",\"reading\":1000},{\"phase\":\"END\",\"inspection_date\":\"2027-01-01\",\"reading\":2000}],\"photos\":[]}");
    measure(
        "renderer_without_photos",
        5,
        100,
        c,
        () ->
            Map.of(
                "generatedBytes",
                renderer.render(snapshot, "Fictional performance card", Map.of()).length));
    var out = Path.of("build/performance/renderer-without-photos.json");
    Files.createDirectories(out.getParent());
    Files.writeString(
        out,
        json.writerWithDefaultPrettyPrinter()
            .writeValueAsString(
                Map.of(
                    "scope",
                    "Renderer only, no DB/storage/queue/network; 5 warmups, 100 samples",
                    "results",
                    results)));
  }

  @Test
  void baseline() throws Exception {
    Path output = Path.of("build/performance");
    Files.createDirectories(output);
    try (var postgres = new PostgreSQLContainer<>("postgres:17-alpine")) {
      postgres.start();
      var configuration = new HikariConfig();
      configuration.setJdbcUrl(postgres.getJdbcUrl());
      configuration.setUsername(postgres.getUsername());
      configuration.setPassword(postgres.getPassword());
      configuration.setMaximumPoolSize(10);
      configuration.setMinimumIdle(2);
      try (var pool = new HikariDataSource(configuration)) {
        Flyway.configure().dataSource(pool).load().migrate();
        var c = new Counters();
        var ds = counted(pool, c);
        var db = new JdbcTemplate(ds);
        var storage =
            new Storage(
                output.resolve("objects"), c, Integer.getInteger("perf.storageLatencyMs", 0));
        var sites = new WorksiteService(new NamedParameterJdbcTemplate(ds), json);
        var renderer =
            new HwpxCardRenderer() {
              @Override
              public byte[] render(
                  com.fasterxml.jackson.databind.JsonNode snapshot,
                  String title,
                  Map<String, byte[]> photos)
                  throws Exception {
                c.renderCalls.incrementAndGet();
                long t = System.nanoTime();
                try {
                  return super.render(snapshot, title, photos);
                } finally {
                  c.renderNs.addAndGet(System.nanoTime() - t);
                }
              }
            };
        var readTx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        readTx.setReadOnly(true);
        var documents =
            new DocumentService(db, storage, json, renderer, new DataSourceTransactionManager(ds));
        UUID imp = UUID.randomUUID();
        db.update("insert into import_jobs(id) values(?)", imp);
        long actor =
            db.queryForObject(
                "insert into users(login_id,nickname,password,role) values('perf','Fictional"
                    + " admin','unused','ADMIN') returning id",
                Long.class);
        db.update(
            "insert into"
                + " worksites(consumer_number,name,address,middle_block,management_number,source_cells,source_sheet,source_row,import_job_id,latitude,longitude)"
                + " select 'PERF-'||n,'Fictional site '||n,'Fictional road '||n,case when n<=100"
                + " then 'PERF_DOCS' else 'M'||(n/1000)::text"
                + " end,n::text,'{}','Synthetic',n+2,?,35.8+(n%100)*0.0001,128.7+((n/100)%200)*0.0001"
                + " from generate_series(1,20000)n",
            imp);
        db.update(
            "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee) select"
                + " id,'START','2026-01-01',1000,?,1500 from worksites where id%2=0",
            actor);
        db.update(
            "insert into inspections(site_id,phase,inspection_date,reading,worker_id,fee) select"
                + " id,'END','2027-01-01',2000,?,1500 from worksites where id%4=0",
            actor);
        var image = new BufferedImage(1600, 1200, BufferedImage.TYPE_INT_RGB);
        var random = new Random(42);
        for (int y = 0; y < 1200; y++)
          for (int x = 0; x < 1600; x++)
            image.setRGB(
                x,
                y,
                ((x * 5 + y * 3) & 255) << 16 | ((x + y * 2) & 255) << 8 | random.nextInt(64));
        var photo = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", photo);
        byte[] picture = photo.toByteArray();
        var photoRows = new ArrayList<Object[]>();
        for (long id = 1; id <= 100; id++)
          for (String slot : List.of("OVERVIEW", "START_CLOSEUP", "END_CLOSEUP")) {
            String key = UUID.randomUUID().toString();
            storage.put(key, picture, "image/jpeg");
            photoRows.add(new Object[] {id, slot, key, picture.length, actor});
          }
        db.batchUpdate(
            "insert into photos(site_id,slot,object_key,content_type,size_bytes,uploaded_by)"
                + " values(?,?,?,'image/jpeg',?,?)",
            photoRows);
        db.execute("analyze");
        var plans = new LinkedHashMap<String, Object>();
        var statements =
            Map.of(
                "list_ids",
                    "select s.id from worksites s order by management_number nulls last,id limit"
                        + " 20",
                "text_search_count",
                    "select count(*) from worksites s where consumer_number ilike '%road 199%' or"
                        + " name ilike '%road 199%' or address ilike '%road 199%' or"
                        + " management_number ilike '%road 199%'",
                "map_clusters",
                    "select floor((longitude-128.69)/(.05/6))::int as"
                        + " x,floor((latitude-35.79)/(.04/6))::int as"
                        + " y,count(*),avg(latitude),avg(longitude) from worksites where latitude"
                        + " between 35.79 and 35.83 and longitude between 128.69 and 128.74 and"
                        + " not(latitude=0 and longitude=0) group by x,y",
                "map_small",
                    "select s.id from worksites s where latitude between 35.8 and 35.8004 and"
                        + " longitude between 128.7 and 128.7004 and not(latitude=0 and"
                        + " longitude=0) order by id limit 501");
        for (var e : statements.entrySet())
          plans.put(
              e.getKey(),
              json.readTree(
                  db.queryForObject(
                      "explain(analyze,buffers,format json) " + e.getValue(), String.class)));
        Files.writeString(
            output.resolve("query-plans.json"),
            json.writerWithDefaultPrettyPrinter().writeValueAsString(plans));
        var all = new WorksiteService.Filter(null, null, null, null);
        measure(
            "list_20_first_page",
            3,
            20,
            c,
            () -> readTx.execute(status -> sites.page(all, 1, 20, true)));
        measure(
            "list_100_first_page",
            2,
            10,
            c,
            () -> readTx.execute(status -> sites.page(all, 1, 100, true)));
        measure(
            "list_20_last_page",
            2,
            20,
            c,
            () -> readTx.execute(status -> sites.page(all, 1000, 20, true)));
        measure(
            "list_20_text_search",
            2,
            10,
            c,
            () ->
                readTx.execute(
                    status ->
                        sites.page(
                            new WorksiteService.Filter(null, null, "road 199", null),
                            1,
                            20,
                            true)));
        measure(
            "dashboard_summary",
            3,
            20,
            c,
            () -> readTx.execute(status -> sites.summary(all, actor, true)));
        var map = new MapSiteController(new NamedParameterJdbcTemplate(ds));
        Method cluster =
            MapSiteController.class.getDeclaredMethod(
                "clusters", double.class, double.class, double.class, double.class, int.class);
        cluster.setAccessible(true);
        Method markers =
            MapSiteController.class.getDeclaredMethod(
                "markers", double.class, double.class, double.class, double.class, int.class);
        markers.setAccessible(true);
        measure(
            "map_cluster_20k",
            3,
            20,
            c,
            () -> cluster.invoke(map, 35.79, 35.83, 128.69, 128.74, 12));
        measure(
            "map_individual_dense",
            3,
            20,
            c,
            () -> markers.invoke(map, 35.79, 35.83, 128.69, 128.74, 16));
        measure(
            "map_individual_small",
            3,
            20,
            c,
            () -> markers.invoke(map, 35.8, 35.8004, 128.7, 128.7004, 16));
        // Controlled concurrency against the same pool; includes synthetic service serialization,
        // no HTTP.
        c.reset();
        long concurrentStart = System.nanoTime();
        var latencies = new ConcurrentLinkedQueue<Double>();
        try (var executor = Executors.newFixedThreadPool(10)) {
          var tasks = new ArrayList<Future<?>>();
          for (int n = 0; n < 100; n++)
            tasks.add(
                executor.submit(
                    () -> {
                      long t = System.nanoTime();
                      try {
                        json.writeValueAsBytes(
                            readTx.execute(status -> sites.page(all, 1, 20, true)));
                        latencies.add((System.nanoTime() - t) / 1e6);
                      } catch (Exception ex) {
                        throw new RuntimeException(ex);
                      }
                    }));
          for (var f : tasks) f.get();
        }
        var ordered = latencies.stream().sorted().toList();
        var concurrent = new LinkedHashMap<String, Object>();
        concurrent.put("name", "list_20_concurrency_10");
        concurrent.put("samples", 100);
        concurrent.put("elapsedMs", (System.nanoTime() - concurrentStart) / 1e6);
        concurrent.put("p50Ms", ordered.get(49));
        concurrent.put("p95Ms", ordered.get(94));
        concurrent.putAll(c.values());
        results.add(concurrent);
        // Warm up renderer separately; no cache entries are created by this warmup.
        renderer.render(
            json.readTree("{\"site\":{},\"inspections\":[],\"photos\":[]}"),
            "Fictional performance card",
            Map.of());
        measure("hwpx_100_first_generation_3photos", 0, 1, c, () -> runJob(documents, actor));
        measure("hwpx_100_repeat_cached", 0, 1, c, () -> runJob(documents, actor));
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("generatedAt", ZonedDateTime.now(ZoneId.of("Asia/Seoul")).toString());
        metadata.put("java", System.getProperty("java.version"));
        metadata.put("processorsVisible", Runtime.getRuntime().availableProcessors());
        metadata.put("maxHeapBytes", Runtime.getRuntime().maxMemory());
        metadata.put("sites", 20000);
        metadata.put("startInspections", 10000);
        metadata.put("endInspections", 5000);
        metadata.put("photographedSites", 100);
        metadata.put("photosPerSite", 3);
        metadata.put("sourcePhotoBytes", picture.length);
        metadata.put("storageLatencyInjectedMs", storage.latencyMs);
        metadata.put("storage", "local files, NOT R2");
        metadata.put(
            "readTransactions",
            "List and summary use read-only TransactionTemplate, matching service transaction"
                + " boundary");
        metadata.put("cpuQuota", Files.readString(Path.of("/sys/fs/cgroup/cpu.max")).strip());
        metadata.put(
            "memoryLimitBytes", Files.readString(Path.of("/sys/fs/cgroup/memory.max")).strip());
        metadata.put(
            "scope",
            "service/controller methods plus JSON serialization; no network, auth, frontend, or"
                + " production data");
        metadata.put(
            "jdbcCounting",
            "JDBC execute invocations; executeBatch counts once; execute time excludes result"
                + " mapping and some cursor fetch time");
        Files.writeString(
            output.resolve("baseline.json"),
            json.writerWithDefaultPrettyPrinter()
                .writeValueAsString(Map.of("environment", metadata, "results", results)));
        System.out.println(
            "PERFORMANCE_BASELINE " + output.resolve("baseline.json").toAbsolutePath());
      }
    } finally {
      Path objects = output.resolve("objects");
      if (Files.exists(objects))
        try (var paths = Files.walk(objects)) {
          for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(p);
        }
    }
  }

  Map<String, Object> runJob(DocumentService documents, long actor) {
    UUID id =
        documents.create(
            new DocumentService.Request(null, "PERF_DOCS", null, "Fictional performance card"),
            actor);
    Map<String, Object> status;
    int ticks = 0;
    do {
      documents.tick();
      status = documents.status(id, actor);
      if (++ticks > 10) throw new IllegalStateException("Unexpected job progress");
    } while (!status.get("status").equals("READY") && !status.get("status").equals("FAILED"));
    if (!status.get("status").equals("READY"))
      throw new IllegalStateException("Document benchmark failed");
    return Map.of(
        "status", status.get("status"), "completed", status.get("completed"), "ticks", ticks);
  }
}
