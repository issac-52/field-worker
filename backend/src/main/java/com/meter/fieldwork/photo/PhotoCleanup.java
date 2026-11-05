package com.meter.fieldwork.photo;

import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
public class PhotoCleanup {
  private final JdbcTemplate db;
  private final ObjectStorage storage;

  public PhotoCleanup(JdbcTemplate db, ObjectStorage storage) {
    this.db = db;
    this.storage = storage;
  }

  @Scheduled(fixedDelayString = "${app.storage.cleanup-delay-ms:60000}", initialDelay = 60000)
  public void cleanup() {
    for (String key :
        db.queryForList(
            "select object_key from photo_deletions order by created_at limit 100", String.class)) {
      try {
        storage.delete(key);
        db.update("delete from photo_deletions where object_key=?", key);
      } catch (RuntimeException ex) {
        org.slf4j.LoggerFactory.getLogger(PhotoCleanup.class)
            .warn("Photo deletion remains queued for retry");
      }
    }
  }
}
