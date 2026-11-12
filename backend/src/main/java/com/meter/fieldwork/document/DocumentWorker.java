package com.meter.fieldwork.document;

import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    name = "app.documents.worker-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class DocumentWorker {
  private final DocumentService service;
  private final LongSupplier clock;
  private long lastIdlePoll;
  private boolean backingOff;

  @org.springframework.beans.factory.annotation.Autowired
  public DocumentWorker(DocumentService service) {
    this(service, System::nanoTime);
  }

  DocumentWorker(DocumentService service, LongSupplier clock) {
    this.service = service;
    this.clock = clock;
  }

  @Scheduled(fixedDelayString = "${app.documents.worker-delay-ms:100}", initialDelay = 10000)
  public void run() {
    if (backingOff && clock.getAsLong() - lastIdlePoll < TimeUnit.SECONDS.toNanos(1)) return;
    backingOff = !service.tick();
    if (backingOff) lastIdlePoll = clock.getAsLong();
  }
}
