package com.meter.fieldwork.photo;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class StorageConfig {
  @Bean
  ObjectStorage objectStorage(Environment env) throws IOException {
    String mode = env.getProperty("app.storage.mode", "r2");
    if (mode.equals("local")) {
      if (java.util.Arrays.asList(env.getActiveProfiles()).contains("prod"))
        throw new IllegalStateException("Production requires R2 storage");
      Path root =
          Path.of(env.getProperty("app.storage.local-root", "build/private-photos"))
              .toAbsolutePath()
              .normalize();
      Files.createDirectories(root);
      return new ObjectStorage() {
        private Path path(String key) {
          if (!key.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException();
          return root.resolve(key);
        }

        public void put(String key, byte[] bytes, String contentType) {
          try {
            Files.write(path(key), bytes, java.nio.file.StandardOpenOption.CREATE_NEW);
          } catch (IOException ex) {
            throw new IllegalStateException("Storage write failed", ex);
          }
        }

        public byte[] get(String key) {
          try {
            return Files.readAllBytes(path(key));
          } catch (IOException ex) {
            throw new IllegalStateException("Storage read failed", ex);
          }
        }

        public void delete(String key) {
          try {
            Files.deleteIfExists(path(key));
          } catch (IOException ex) {
            throw new IllegalStateException("Storage delete failed", ex);
          }
        }
      };
    }
    if (!mode.equals("r2")) throw new IllegalArgumentException("Unknown storage mode");
    URI endpoint = URI.create(env.getRequiredProperty("R2_ENDPOINT"));
    if (!endpoint.getScheme().equals("https"))
      throw new IllegalArgumentException("R2 endpoint must use HTTPS");
    S3Client client =
        S3Client.builder()
            .endpointOverride(endpoint)
            .region(Region.of("auto"))
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(
                        env.getRequiredProperty("R2_ACCESS_KEY_ID"),
                        env.getRequiredProperty("R2_SECRET_ACCESS_KEY"))))
            .build();
    String bucket = env.getRequiredProperty("R2_BUCKET");
    return new R2Storage(client, bucket);
  }

  private static class R2Storage implements ObjectStorage, AutoCloseable {
    final S3Client client;
    final String bucket;

    R2Storage(S3Client client, String bucket) {
      this.client = client;
      this.bucket = bucket;
    }

    public void put(String key, byte[] bytes, String type) {
      client.putObject(
          b -> b.bucket(bucket).key(key).contentType(type), RequestBody.fromBytes(bytes));
    }

    public byte[] get(String key) {
      return client.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray();
    }

    public void delete(String key) {
      client.deleteObject(b -> b.bucket(bucket).key(key));
    }

    public void close() {
      client.close();
    }
  }
}
