package com.meter.fieldwork.document;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record DocumentBatchSettings(int batchSize, int parallelism, int zipCompressionLevel) {
  public DocumentBatchSettings(
      @Value("${app.documents.batch-size:200}") int batchSize,
      @Value("${app.documents.parallelism:2}") int parallelism,
      @Value("${app.documents.zip-compression-level:0}") int zipCompressionLevel) {
    if (batchSize < 1
        || batchSize > 1000
        || parallelism < 1
        || parallelism > 4
        || zipCompressionLevel < 0
        || zipCompressionLevel > 9)
      throw new IllegalArgumentException(
          "Document batch 1..1000, parallelism 1..4, ZIP level 0..9 required");
    this.batchSize = batchSize;
    this.parallelism = parallelism;
    this.zipCompressionLevel = zipCompressionLevel;
  }

  public static DocumentBatchSettings defaults() {
    return new DocumentBatchSettings(200, 2, 0);
  }
}
