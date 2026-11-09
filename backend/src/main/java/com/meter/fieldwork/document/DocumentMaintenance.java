package com.meter.fieldwork.document;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    name = "app.documents.maintenance-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class DocumentMaintenance {
  private final DocumentService service;

  public DocumentMaintenance(DocumentService service) {
    this.service = service;
  }

  @Scheduled(fixedDelay = 2000, initialDelay = 10000)
  public void run() {
    service.maintain();
  }
}
