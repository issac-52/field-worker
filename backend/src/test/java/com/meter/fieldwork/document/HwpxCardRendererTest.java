package com.meter.fieldwork.document;

import static org.assertj.core.api.Assertions.*;

import java.awt.image.BufferedImage;
import org.junit.jupiter.api.Test;

class HwpxCardRendererTest {
  @Test
  void dropsAttachmentBadgeUsesSmallBlockAndKeepsBothDatesOnOneLine() throws Exception {
    var snapshot =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(
                """
                {"site":{"small_block":"가상 소블록"},"inspections":[
                  {"phase":"START","inspection_date":"2026-11-19","reading":10},
                  {"phase":"END","inspection_date":"2027-12-31","reading":11}
                ]}
                """);
    var files = new java.util.HashMap<String, byte[]>();
    byte[] result = new HwpxCardRenderer().render(snapshot, "Test", java.util.Map.of());
    try (var zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(result))) {
      for (java.util.zip.ZipEntry entry; (entry = zip.getNextEntry()) != null; )
        files.put(entry.getName(), zip.readAllBytes());
    }
    var doc = HwpxCardRenderer.xml(files.get("Contents/section0.xml"));
    assertThat(doc.getDocumentElement().getTextContent())
        .doesNotContain("붙임.2")
        .contains("검침카드 양식");
    assertThat(cell(doc, "4", "7").getTextContent()).isEqualTo("봉인있음");
    assertThat(cell(doc, "5", "2").getTextContent()).isEqualTo("가상 소블록");
    var header = HwpxCardRenderer.xml(files.get("Contents/header.xml"));
    var styles = header.getElementsByTagNameNS("http://www.hancom.co.kr/hwpml/2011/head", "charPr");
    String[] columns = {"1", "5"};
    String[] dates = {"2026-11-19", "2027-12-31"};
    for (int i = 0; i < columns.length; i++) {
      var date = cell(doc, "7", columns[i]);
      assertThat(date.getTextContent()).isEqualTo(dates[i]);
      var sub =
          (org.w3c.dom.Element) date.getElementsByTagNameNS(HwpxCardRenderer.HP, "subList").item(0);
      assertThat(sub.getAttribute("lineWrap")).isEqualTo("SQUEEZE");
      var run =
          (org.w3c.dom.Element) date.getElementsByTagNameNS(HwpxCardRenderer.HP, "run").item(0);
      String styleId = run.getAttribute("charPrIDRef");
      String size = null;
      for (int j = 0; j < styles.getLength(); j++) {
        var style = (org.w3c.dom.Element) styles.item(j);
        if (style.getAttribute("id").equals(styleId)) size = style.getAttribute("height");
      }
      assertThat(size).isEqualTo("900");
    }
  }

  private static org.w3c.dom.Element cell(org.w3c.dom.Document doc, String row, String column) {
    var table =
        (org.w3c.dom.Element) doc.getElementsByTagNameNS(HwpxCardRenderer.HP, "tbl").item(1);
    var cells = table.getElementsByTagNameNS(HwpxCardRenderer.HP, "tc");
    for (int i = 0; i < cells.getLength(); i++) {
      var cell = (org.w3c.dom.Element) cells.item(i);
      var address =
          (org.w3c.dom.Element)
              cell.getElementsByTagNameNS(HwpxCardRenderer.HP, "cellAddr").item(0);
      if (row.equals(address.getAttribute("rowAddr"))
          && column.equals(address.getAttribute("colAddr"))) return cell;
    }
    throw new AssertionError("Missing HWPX cell " + row + ":" + column);
  }

  @Test
  void conditionCellUsesSelectionOrOtherTextAndNeverLegacyNote() throws Exception {
    var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
    var renderer = new HwpxCardRenderer();
    for (String[] example :
        new String[][] {
          {"HOPE", "stale", "호폐"},
          {"LOCATION_UNKNOWN", "stale", "위치불명"},
          {"STACKED", "stale", "적재"},
          {"OTHER", "  Fictional detail  ", "Fictional detail"},
          {"NONE", "stale", ""}
        }) {
      var snapshot = mapper.createObjectNode();
      var site = snapshot.putObject("site");
      site.put("special_condition", example[0]);
      site.put("special_description", example[1]);
      site.put("note", "Legacy memo");
      byte[] bytes = renderer.render(snapshot, "Test", java.util.Map.of());
      byte[] section = null;
      try (var zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(bytes))) {
        for (java.util.zip.ZipEntry entry; (entry = zip.getNextEntry()) != null; )
          if (entry.getName().equals("Contents/section0.xml")) section = zip.readAllBytes();
      }
      assertThat(section).isNotNull();
      var doc = HwpxCardRenderer.xml(section);
      var cells = doc.getElementsByTagNameNS(HwpxCardRenderer.HP, "tc");
      String actual = null;
      for (int i = 0; i < cells.getLength(); i++) {
        var cell = (org.w3c.dom.Element) cells.item(i);
        var addr =
            (org.w3c.dom.Element)
                cell.getElementsByTagNameNS(HwpxCardRenderer.HP, "cellAddr").item(0);
        if (addr.getAttribute("rowAddr").equals("5") && addr.getAttribute("colAddr").equals("7"))
          actual = cell.getTextContent().strip();
      }
      assertThat(actual).isEqualTo(example[2]);
    }
  }

  @Test
  void jpegEntriesAreStoredWithoutSecondCompression() throws Exception {
    var image = new BufferedImage(32, 24, BufferedImage.TYPE_INT_RGB);
    var source = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", source);
    var snapshot =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree("{\"site\":{},\"inspections\":[]}");
    byte[] result =
        new HwpxCardRenderer()
            .render(snapshot, "Test", java.util.Map.of("OVERVIEW", source.toByteArray()));
    boolean found = false;
    try (var zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(result))) {
      for (java.util.zip.ZipEntry entry; (entry = zip.getNextEntry()) != null; )
        if (entry.getName().endsWith(".jpg")) {
          found = true;
          assertThat(entry.getMethod()).isEqualTo(java.util.zip.ZipEntry.STORED);
          assertThat(
                  javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(zip.readAllBytes())))
              .isNotNull();
        }
    }
    assertThat(found).isTrue();
  }

  @Test
  void largePhotosAreSubsampledBeforeFullResolutionAllocation() throws Exception {
    var source = new BufferedImage(4000, 3000, BufferedImage.TYPE_INT_RGB);
    var bytes = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(source, "jpg", bytes);
    var decoded = HwpxCardRenderer.readForExport(bytes.toByteArray());
    assertThat(decoded.getWidth()).isEqualTo(1334);
    assertThat(decoded.getHeight()).isEqualTo(1000);
  }

  @Test
  void rotatesPortraitPhotoAndPreservesPixels() {
    var source = new BufferedImage(2, 1, BufferedImage.TYPE_INT_RGB);
    source.setRGB(0, 0, 0xff0000);
    source.setRGB(1, 0, 0x0000ff);
    var result = HwpxCardRenderer.orient(source, 6);
    assertThat(result.getWidth()).isEqualTo(1);
    assertThat(result.getHeight()).isEqualTo(2);
    assertThat(result.getRGB(0, 0) & 0xffffff).isEqualTo(0xff0000);
    assertThat(result.getRGB(0, 1) & 0xffffff).isEqualTo(0x0000ff);
  }
}
