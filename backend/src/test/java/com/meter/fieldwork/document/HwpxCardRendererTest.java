package com.meter.fieldwork.document;

import static org.assertj.core.api.Assertions.*;

import java.awt.image.BufferedImage;
import org.junit.jupiter.api.Test;

class HwpxCardRendererTest {
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
