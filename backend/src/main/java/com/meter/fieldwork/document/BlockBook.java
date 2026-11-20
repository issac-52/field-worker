package com.meter.fieldwork.document;

import java.io.*;
import java.util.*;
import java.util.zip.*;
import org.w3c.dom.*;

/** Writes one section per cached inspection card directly into a nested HWPX. */
final class BlockBook implements Closeable {
  private final ZipOutputStream zip;
  private Document header, manifest;
  private Element items, spine;
  private int sections;
  private static final String OPF = "http://www.idpf.org/2007/opf/";

  BlockBook(OutputStream outer) {
    zip =
        new ZipOutputStream(
            new FilterOutputStream(outer) {
              @Override
              public void write(byte[] bytes, int offset, int count) throws IOException {
                out.write(bytes, offset, count);
              }

              @Override
              public void close() throws IOException {
                flush();
              }
            });
  }

  void append(byte[] card) throws IOException {
    String prefix = "s" + sections + "_";
    String section = "section" + sections;
    try (var input = new ZipInputStream(new ByteArrayInputStream(card))) {
      for (ZipEntry e; (e = input.getNextEntry()) != null; ) {
        String path = e.getName();
        if (path.equals("Contents/content.hpf") && sections == 0) {
          manifest = HwpxCardRenderer.xml(input.readAllBytes());
          items = (Element) manifest.getElementsByTagNameNS(OPF, "manifest").item(0);
          spine = (Element) manifest.getElementsByTagNameNS(OPF, "spine").item(0);
          for (Node n = items.getFirstChild(); n != null; ) {
            Node next = n.getNextSibling();
            if (n instanceof Element item
                && (item.getAttribute("href").startsWith("BinData/")
                    || item.getAttribute("id").equals("section0"))) items.removeChild(n);
            n = next;
          }
          var refs = spine.getElementsByTagNameNS(OPF, "itemref");
          for (int i = refs.getLength() - 1; i >= 0; i--)
            if (((Element) refs.item(i)).getAttribute("idref").equals("section0"))
              spine.removeChild(refs.item(i));
        } else if (path.equals("Contents/header.xml") && sections == 0) {
          header = HwpxCardRenderer.xml(input.readAllBytes());
        } else if (path.equals("Contents/section0.xml")) {
          var doc = HwpxCardRenderer.xml(input.readAllBytes());
          var images = doc.getElementsByTagNameNS(HwpxCardRenderer.HC, "img");
          for (int i = 0; i < images.getLength(); i++) {
            var image = (Element) images.item(i);
            image.setAttribute("binaryItemIDRef", prefix + image.getAttribute("binaryItemIDRef"));
          }
          var objects = doc.getElementsByTagNameNS(HwpxCardRenderer.HP, "pic");
          for (int i = 0; i < objects.getLength(); i++) {
            var pic = (Element) objects.item(i);
            String id = Integer.toString(1000000 + sections * 10 + i);
            pic.setAttribute("id", id);
            pic.setAttribute("instid", id);
          }
          ((Element) doc.getElementsByTagNameNS(HwpxCardRenderer.HP, "tbl").item(0))
              .setAttribute("id", Integer.toString(2000000 + sections));
          put("Contents/" + section + ".xml", HwpxCardRenderer.bytes(doc), false);
        } else if (path.startsWith("BinData/")) {
          String name = prefix + path.substring("BinData/".length());
          var item = add(items, "item", "id", name.substring(0, name.lastIndexOf('.')));
          item.setAttribute("href", "BinData/" + name);
          item.setAttribute("media-type", "image/jpeg");
          item.setAttribute("isEmbeded", "1");
          put("BinData/" + name, input.readAllBytes(), true);
        } else if (sections == 0) {
          put(path, input.readAllBytes(), path.equals("mimetype"));
        }
      }
      var item = add(items, "item", "id", section);
      item.setAttribute("href", "Contents/" + section + ".xml");
      item.setAttribute("media-type", "application/xml");
      add(spine, "itemref", "idref", section);
      sections++;
    } catch (Exception ex) {
      throw new IOException("소블록 검침카드 조립 실패", ex);
    }
  }

  private Element add(Element parent, String tag, String key, String value) {
    Element child = manifest.createElementNS(OPF, "opf:" + tag);
    child.setAttribute(key, value);
    parent.appendChild(child);
    return child;
  }

  private void put(String path, byte[] bytes, boolean stored) throws IOException {
    var entry = new ZipEntry(path);
    if (stored) {
      var crc = new CRC32();
      crc.update(bytes);
      entry.setMethod(ZipEntry.STORED);
      entry.setSize(bytes.length);
      entry.setCrc(crc.getValue());
    }
    zip.putNextEntry(entry);
    zip.write(bytes);
    zip.closeEntry();
  }

  @Override
  public void close() throws IOException {
    try (zip) {
      header.getDocumentElement().setAttribute("secCnt", Integer.toString(sections));
      put("Contents/header.xml", HwpxCardRenderer.bytes(header), false);
      put("Contents/content.hpf", HwpxCardRenderer.bytes(manifest), false);
    } catch (Exception ex) {
      throw new IOException("소블록 검침카드 마무리 실패", ex);
    }
  }
}
