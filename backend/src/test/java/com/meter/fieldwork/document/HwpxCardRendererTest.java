package com.meter.fieldwork.document;

import static org.assertj.core.api.Assertions.*;

import java.awt.image.BufferedImage;
import org.junit.jupiter.api.Test;

class HwpxCardRendererTest {
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
