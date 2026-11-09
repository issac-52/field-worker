package com.meter.fieldwork.document;

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

  public DocumentWorker(DocumentService service) {
    this.service = service;
  }

  @Scheduled(fixedDelayString = "${app.documents.worker-delay-ms:1000}", initialDelay = 10000)
  public void run() {
    service.tick();
  }
}
