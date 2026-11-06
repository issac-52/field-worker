package com.meter.fieldwork.photo;

import com.meter.fieldwork.global.ApiException;
import java.io.ByteArrayInputStream;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class PhotoService {
  public enum Slot {
    OVERVIEW,
    START_CLOSEUP,
    END_CLOSEUP,
    TEMPORARY,
    EXTRA_1,
    EXTRA_2
  }

  private final JdbcTemplate db;
  private final ObjectStorage storage;

  public PhotoService(JdbcTemplate db, ObjectStorage storage) {
    this.db = db;
    this.storage = storage;
  }

  @Transactional
  public void upload(
      long site, Slot slot, byte[] bytes, long actor, Long replacing, boolean admin) {
    if (slot == null && replacing == null) throw new IllegalArgumentException();
    String type = validateImage(bytes);
    if (db.queryForList("select id from worksites where id=? for update", site).isEmpty())
      throw new ApiException(404, "SITE_NOT_FOUND", "수용가를 찾을 수 없습니다.");
    Map<String, Object> old = null;
    if (replacing != null) {
      old = photo(site, replacing);
      checkOwner(old, actor, admin);
      slot = Slot.valueOf((String) old.get("slot"));
    } else if (db.queryForObject("select count(*) from photos where site_id=?", Integer.class, site)
        >= 6) throw new ApiException(409, "PHOTO_LIMIT", "현장당 사진은 총 6장까지 등록할 수 있습니다.");
    if (replacing == null
        && db.queryForObject(
                "select count(*) from photos where site_id=? and slot=?",
                Integer.class,
                site,
                slot.name())
            > 0) throw new ApiException(409, "SLOT_EXISTS", "기존 사진 교체 API를 사용하세요.");
    String key = UUID.randomUUID().toString();
    storage.put(key, bytes, type);
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCompletion(int status) {
            if (status != STATUS_COMMITTED) storage.delete(key);
          }
        });
    if (old != null) {
      db.update(
          "insert into photo_deletions(object_key) values(?) on conflict do nothing",
          old.get("object_key"));
      db.update(
          "update photos set"
              + " object_key=?,content_type=?,size_bytes=?,uploaded_by=?,created_at=now() where"
              + " id=?",
          key,
          type,
          bytes.length,
          actor,
          replacing);
    } else
      db.update(
          "insert into photos(site_id,slot,object_key,content_type,size_bytes,uploaded_by)"
              + " values(?,?,?,?,?,?)",
          site,
          slot.name(),
          key,
          type,
          bytes.length,
          actor);
  }

  @Transactional
  public void delete(long site, long id, long actor, boolean admin) {
    db.queryForList("select id from worksites where id=? for update", site);
    var photo = photo(site, id);
    checkOwner(photo, actor, admin);
    db.update(
        "insert into photo_deletions(object_key) values(?) on conflict do nothing",
        photo.get("object_key"));
    db.update("delete from photos where id=?", id);
  }

  public record Content(String type, byte[] bytes) {}

  @Transactional(readOnly = true)
  public Content content(long site, long id) {
    var photo = photo(site, id);
    return new Content(
        (String) photo.get("content_type"), storage.get((String) photo.get("object_key")));
  }

  private Map<String, Object> photo(long site, long id) {
    var rows = db.queryForList("select * from photos where site_id=? and id=?", site, id);
    if (rows.isEmpty()) throw new ApiException(404, "PHOTO_NOT_FOUND", "사진을 찾을 수 없습니다.");
    return rows.getFirst();
  }

  private void checkOwner(Map<String, Object> photo, long actor, boolean admin) {
    if (!admin && ((Number) photo.get("uploaded_by")).longValue() != actor)
      throw new ApiException(403, "FORBIDDEN", "본인이 등록한 사진만 변경할 수 있습니다.");
  }

  private String validateImage(byte[] bytes) {
    if (bytes.length == 0 || bytes.length > 10485760)
      throw new ApiException(400, "INVALID_IMAGE", "사진은 10MB 이하의 JPEG 또는 PNG여야 합니다.");
    try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw new IllegalArgumentException();
      var reader = readers.next();
      try {
        reader.setInput(input);
        String type = reader.getFormatName().toLowerCase(Locale.ROOT);
        if (!Set.of("jpeg", "png").contains(type)
            || (long) reader.getWidth(0) * reader.getHeight(0) > 25000000)
          throw new IllegalArgumentException();
        if (reader.read(0) == null) throw new IllegalArgumentException();
        return "image/" + type;
      } finally {
        reader.dispose();
      }
    } catch (Exception ex) {
      throw new ApiException(400, "INVALID_IMAGE", "유효한 JPEG/PNG 이미지와 해상도를 확인하세요.");
    }
  }
}
