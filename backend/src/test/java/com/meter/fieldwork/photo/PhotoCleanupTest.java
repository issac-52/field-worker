package com.meter.fieldwork.photo;

import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class PhotoCleanupTest {
  @Test
  void retriesFailedObjectDeletionWithoutRemovingQueueEntry() {
    var db = mock(JdbcTemplate.class);
    var storage = mock(ObjectStorage.class);
    when(db.queryForList(
            "select object_key from photo_deletions order by created_at limit 100", String.class))
        .thenReturn(List.of("test-key"));
    doThrow(new IllegalStateException("Unavailable")).doNothing().when(storage).delete("test-key");
    var cleanup = new PhotoCleanup(db, storage);
    cleanup.cleanup();
    verify(db, never()).update("delete from photo_deletions where object_key=?", "test-key");
    cleanup.cleanup();
    verify(storage, times(2)).delete("test-key");
    verify(db).update("delete from photo_deletions where object_key=?", "test-key");
  }
}
