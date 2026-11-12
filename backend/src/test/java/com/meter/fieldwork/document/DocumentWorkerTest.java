package com.meter.fieldwork.document;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class DocumentWorkerTest {
  @Test
  void idleDatabasePollsBackOffButActiveBatchesContinueImmediately() {
    var service = mock(DocumentService.class);
    var time = new AtomicLong(1);
    var worker = new DocumentWorker(service, time::get);
    when(service.tick()).thenReturn(false, true, true);
    worker.run();
    worker.run();
    time.set(500_000_000);
    worker.run();
    verify(service, times(1)).tick();
    time.set(1_000_000_001L);
    worker.run();
    worker.run();
    verify(service, times(3)).tick();
  }

  @Test
  void idlePollingAlsoWorksWithANegativeNanoTimeOrigin() {
    var service = mock(DocumentService.class);
    var time = new AtomicLong(-2_000_000_000L);
    var worker = new DocumentWorker(service, time::get);
    when(service.tick()).thenReturn(false);
    worker.run();
    time.addAndGet(1_000_000_000L);
    worker.run();
    verify(service, times(2)).tick();
  }

  @Test
  void unsafeBatchOrParallelSettingsAreRejected() {
    assertThatThrownBy(() -> new DocumentBatchSettings(0, 2, 0))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new DocumentBatchSettings(1001, 2, 0))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new DocumentBatchSettings(200, 5, 0))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new DocumentBatchSettings(200, 2, 10))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(DocumentBatchSettings.defaults().batchSize()).isEqualTo(200);
  }
}
