package com.meter.fieldwork.document;

import com.fasterxml.jackson.databind.JsonNode;
import com.meter.fieldwork.worksite.SpecialCondition;
import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import java.util.zip.*;
import javax.imageio.ImageIO;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.*;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.springframework.stereotype.Component;
import org.w3c.dom.*;

@Component
public class HwpxCardRenderer {
  public static final String VERSION = "card-2";
  static final String HP = "http://www.hancom.co.kr/hwpml/2011/paragraph";
  static final String HC = "http://www.hancom.co.kr/hwpml/2011/core";
  private final Map<String, byte[]> template;

  public HwpxCardRenderer() throws IOException {
    template = new LinkedHashMap<>();
    try (var in =
        new ZipInputStream(
            Objects.requireNonNull(getClass().getResourceAsStream("/hwpx/card-template.hwpx")))) {
      for (ZipEntry e; (e = in.getNextEntry()) != null; )
        template.put(e.getName(), in.readAllBytes());
    }
  }

  public byte[] render(JsonNode snapshot, String title, Map<String, byte[]> photos)
      throws Exception {
    var files = new LinkedHashMap<>(template);
    Document section = xml(files.get("Contents/section0.xml"));
    Element table = (Element) section.getElementsByTagNameNS(HP, "tbl").item(1);
    var cells = new HashMap<String, Element>();
    NodeList all = table.getElementsByTagNameNS(HP, "tc");
    for (int i = 0; i < all.getLength(); i++) {
      Element cell = (Element) all.item(i);
      Element addr = (Element) cell.getElementsByTagNameNS(HP, "cellAddr").item(0);
      cells.put(addr.getAttribute("rowAddr") + ":" + addr.getAttribute("colAddr"), cell);
    }
    JsonNode site = snapshot.path("site");
    text(cells.get("0:0"), title + " 수용가 검침 카드");
    text(cells.get("1:0"), "관리번호 : " + value(site, "management_number"));
    text(cells.get("2:2"), value(site, "name"));
    text(cells.get("2:7"), value(site, "address"));
    String supply = site.path("source_cells").path("AZ").asText("");
    text(cells.get("3:2"), supply.isBlank() ? value(site, "consumer_number") : supply);
    text(cells.get("3:7"), value(site, "industry"));
    text(cells.get("4:2"), value(site, "meter_number"));
    text(cells.get("4:7"), "미확인");
    text(cells.get("5:2"), "미기재");
    SpecialCondition condition =
        SpecialCondition.valueOf(site.path("special_condition").asText("NONE"));
    text(cells.get("5:7"), condition.displayText(site.path("special_description").asText("")));
    JsonNode start = null, end = null;
    for (JsonNode i : snapshot.path("inspections")) {
      if (i.path("phase").asText().equals("START")) start = i;
      else end = i;
    }
    text(cells.get("7:1"), start == null ? "" : value(start, "inspection_date"));
    text(cells.get("7:5"), end == null ? "" : value(end, "inspection_date"));
    text(
        cells.get("8:1"),
        start == null ? "" : start.path("reading").decimalValue().toPlainString() + " ㎥");
    text(
        cells.get("8:5"),
        end == null ? "" : end.path("reading").decimalValue().toPlainString() + " ㎥");
    text(
        cells.get("7:6"),
        start == null || end == null
            ? ""
            : end.path("reading")
                    .decimalValue()
                    .subtract(start.path("reading").decimalValue())
                    .toPlainString()
                + " ㎥");
    text(
        cells.get("10:0"), ""); // Location map intentionally omitted: no external map/search calls.
    Document manifest = xml(files.get("Contents/content.hpf"));
    Element items =
        (Element)
            manifest.getElementsByTagNameNS("http://www.idpf.org/2007/opf/", "manifest").item(0);
    String[] slots = {"OVERVIEW", "START_CLOSEUP", "END_CLOSEUP"},
        addresses = {"10:4", "12:0", "12:4"};
    for (int i = 0; i < slots.length; i++) {
      Element cell = cells.get(addresses[i]);
      text(cell, "");
      if (!photos.containsKey(slots[i])) continue;
      var image = resize(photos.get(slots[i]));
      var bytes = new ByteArrayOutputStream();
      ImageIO.write(image, "jpg", bytes);
      String id = "cardImage" + (i + 1), path = "BinData/" + id + ".jpg";
      files.put(path, bytes.toByteArray());
      Element item = manifest.createElementNS(items.getNamespaceURI(), "opf:item");
      item.setAttribute("id", id);
      item.setAttribute("href", path);
      item.setAttribute("media-type", "image/jpeg");
      item.setAttribute("isEmbeded", "1");
      items.appendChild(item);
      picture(cell, id, image.getWidth(), image.getHeight(), i + 1);
    }
    // Cached layout segments refer to the empty original form. Let Hancom lay out updated text.
    NodeList lines = section.getElementsByTagNameNS(HP, "linesegarray");
    while (lines.getLength() > 0) {
      Node n = lines.item(0);
      n.getParentNode().removeChild(n);
    }
    files.put("Contents/section0.xml", bytes(section));
    files.put("Contents/content.hpf", bytes(manifest));
    var out = new ByteArrayOutputStream();
    try (var zip = new ZipOutputStream(out)) {
      for (var entry : files.entrySet()) {
        var e = new ZipEntry(entry.getKey());
        if (entry.getKey().equals("mimetype")
            || entry.getKey().startsWith("BinData/") && entry.getKey().endsWith(".jpg")) {
          var crc = new CRC32();
          crc.update(entry.getValue());
          e.setMethod(ZipEntry.STORED);
          e.setSize(entry.getValue().length);
          e.setCrc(crc.getValue());
        }
        zip.putNextEntry(e);
        zip.write(entry.getValue());
        zip.closeEntry();
      }
    }
    return out.toByteArray();
  }

  private static String value(JsonNode node, String key) {
    String v = node.path(key).asText("");
    return v.isBlank() ? "미기재" : v;
  }

  private static Element text(Element cell, String value) {
    Element sub = (Element) cell.getElementsByTagNameNS(HP, "subList").item(0);
    Element old = (Element) sub.getElementsByTagNameNS(HP, "p").item(0);
    Element p = (Element) old.cloneNode(false);
    p.setAttribute("id", "0");
    Element run =
        (Element) ((Element) old.getElementsByTagNameNS(HP, "run").item(0)).cloneNode(false);
    while (sub.hasChildNodes()) sub.removeChild(sub.getFirstChild());
    sub.appendChild(p);
    p.appendChild(run);
    Element t = cell.getOwnerDocument().createElementNS(HP, "hp:t");
    t.setTextContent(value);
    run.appendChild(t);
    return run;
  }

  // Decode near the export resolution instead of allocating a full 25MP phone image per worker.
  static BufferedImage readForExport(byte[] bytes) throws IOException {
    try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      if (input == null) throw new IOException("Invalid image");
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw new IOException("Invalid image");
      var reader = readers.next();
      try {
        reader.setInput(input, true, true);
        int sample = Math.max(1, Math.max(reader.getWidth(0), reader.getHeight(0)) / 1280);
        var params = reader.getDefaultReadParam();
        params.setSourceSubsampling(sample, sample, 0, 0);
        return reader.read(0, params);
      } finally {
        reader.dispose();
      }
    }
  }

  private static BufferedImage resize(byte[] bytes) throws IOException {
    BufferedImage source = readForExport(bytes);
    double scale = Math.min(1, 1280.0 / Math.max(source.getWidth(), source.getHeight()));
    BufferedImage target =
        new BufferedImage(
            Math.max(1, (int) (source.getWidth() * scale)),
            Math.max(1, (int) (source.getHeight() * scale)),
            BufferedImage.TYPE_INT_RGB);
    var g = target.createGraphics();
    try {
      g.setColor(Color.WHITE);
      g.fillRect(0, 0, target.getWidth(), target.getHeight());
      g.setRenderingHint(
          RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
      g.drawImage(source, 0, 0, target.getWidth(), target.getHeight(), null);
    } finally {
      g.dispose();
    }
    int orientation = 1;
    try {
      var metadata =
          com.drew.imaging.ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes));
      var exif = metadata.getFirstDirectoryOfType(com.drew.metadata.exif.ExifIFD0Directory.class);
      if (exif != null
          && exif.containsTag(com.drew.metadata.exif.ExifIFD0Directory.TAG_ORIENTATION))
        orientation = exif.getInt(com.drew.metadata.exif.ExifIFD0Directory.TAG_ORIENTATION);
    } catch (com.drew.imaging.ImageProcessingException
        | com.drew.metadata.MetadataException ignored) {
      // Images without EXIF use their stored pixel orientation.
    }
    return orient(target, orientation);
  }

  static BufferedImage orient(BufferedImage source, int orientation) {
    if (orientation < 2 || orientation > 8) return source;
    int w = source.getWidth(), h = source.getHeight();
    var result =
        new BufferedImage(
            orientation >= 5 ? h : w, orientation >= 5 ? w : h, BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < h; y++)
      for (int x = 0; x < w; x++) {
        int dx = x, dy = y;
        switch (orientation) {
          case 2 -> dx = w - 1 - x;
          case 3 -> {
            dx = w - 1 - x;
            dy = h - 1 - y;
          }
          case 4 -> dy = h - 1 - y;
          case 5 -> {
            dx = y;
            dy = x;
          }
          case 6 -> {
            dx = h - 1 - y;
            dy = x;
          }
          case 7 -> {
            dx = h - 1 - y;
            dy = w - 1 - x;
          }
          case 8 -> {
            dx = y;
            dy = w - 1 - x;
          }
          default -> {}
        }
        result.setRGB(dx, dy, source.getRGB(x, y));
      }
    return result;
  }

  private static void picture(Element cell, String image, int pixelW, int pixelH, int number)
      throws Exception {
    Element size = (Element) cell.getElementsByTagNameNS(HP, "cellSz").item(0);
    double scale =
        Math.min(
            (Integer.parseInt(size.getAttribute("width")) - 800.0) / pixelW,
            (Integer.parseInt(size.getAttribute("height")) - 800.0) / pixelH);
    int w = (int) (pixelW * scale), h = (int) (pixelH * scale);
    String pic =
        """
        <hp:pic xmlns:hp="%s" xmlns:hc="%s" id="%d" zOrder="%d" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="%d" reverse="0">
        <hp:offset x="0" y="0"/><hp:orgSz width="%d" height="%d"/><hp:curSz width="%d" height="%d"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/>
        <hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>
        <hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="%d" y="0"/><hc:pt2 x="%d" y="%d"/><hc:pt3 x="0" y="%d"/></hp:imgRect><hp:imgClip left="0" right="%d" top="0" bottom="%d"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="%d" dimheight="%d"/><hc:img binaryItemIDRef="%s" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
        <hp:sz width="%d" widthRelTo="ABSOLUTE" height="%d" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>검침 사진</hp:shapeComment></hp:pic>
        """
            .formatted(
                HP,
                HC,
                200000 + number,
                number,
                200000 + number,
                w,
                h,
                w,
                h,
                w,
                w,
                h,
                h,
                w,
                h,
                w,
                h,
                image,
                w,
                h);
    Element run = text(cell, "");
    run.insertBefore(
        cell.getOwnerDocument()
            .importNode(
                xml(pic.getBytes(java.nio.charset.StandardCharsets.UTF_8)).getDocumentElement(),
                true),
        run.getFirstChild());
  }

  static Document xml(byte[] input) throws Exception {
    var f = DocumentBuilderFactory.newInstance();
    f.setNamespaceAware(true);
    f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    return f.newDocumentBuilder().parse(new ByteArrayInputStream(input));
  }

  private static byte[] bytes(Document doc) throws Exception {
    var f = TransformerFactory.newInstance();
    f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    f.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
    var out = new ByteArrayOutputStream();
    f.newTransformer().transform(new DOMSource(doc), new StreamResult(out));
    return out.toByteArray();
  }
}
