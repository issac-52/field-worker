package com.meter.fieldwork.excel;

import com.meter.fieldwork.global.ApiException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.util.XMLHelper;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler;
import org.apache.poi.xssf.usermodel.XSSFComment;
import org.xml.sax.InputSource;

/** SAX rows; retain at most one formatted row plus POI shared strings at the parser boundary. */
public class ExcelRows {
  public record Row(String sheet, int number, Map<String, String> cells, boolean hidden) {
    public Row(String sheet, int number, Map<String, String> cells) {
      this(sheet, number, cells, false);
    }

    public String cell(String column) {
      return cells.getOrDefault(column, "");
    }
  }

  public void read(InputStream stream, Consumer<Row> consumer) {
    try (OPCPackage pkg = OPCPackage.open(stream)) {
      XSSFReader reader = new XSSFReader(pkg);
      var sheets = (XSSFReader.SheetIterator) reader.getSheetsData();
      boolean found = false;
      while (sheets.hasNext()) {
        try (InputStream sheet = sheets.next()) {
          String name = sheets.getSheetName();
          var handler = new RowsHandler(name, consumer);
          var parser = XMLHelper.newXMLReader();
          parser.setContentHandler(
              new XSSFSheetXMLHandler(
                  reader.getStylesTable(),
                  null,
                  reader.getSharedStringsTable(),
                  handler,
                  new DataFormatter(Locale.ROOT),
                  false));
          var filter =
              new org.xml.sax.helpers.XMLFilterImpl(parser) {
                @Override
                public void startElement(
                    String uri, String local, String qName, org.xml.sax.Attributes attrs)
                    throws org.xml.sax.SAXException {
                  if ("row".equals(local) || "row".equals(qName))
                    handler.hidden =
                        "1".equals(attrs.getValue("hidden"))
                            || "true".equals(attrs.getValue("hidden"));
                  super.startElement(uri, local, qName, attrs);
                }
              };
          filter.setContentHandler(parser.getContentHandler());
          filter.parse(new InputSource(sheet));
          if (!handler.header) throw invalid();
          found = true;
        }
      }
      if (!found) throw invalid();
    } catch (ApiException ex) {
      throw ex;
    } catch (org.springframework.dao.DataAccessException ex) {
      throw ex;
    } catch (Exception ex) {
      throw invalid();
    }
  }

  private static ApiException invalid() {
    return new ApiException(400, "INVALID_WORKBOOK", "지원하는 XLSX 파일과 2행 기본정보 헤더를 확인하세요.");
  }

  private static class RowsHandler implements XSSFSheetXMLHandler.SheetContentsHandler {
    final String sheet;
    final Consumer<Row> consumer;
    Map<String, String> cells;
    boolean header;
    boolean hidden;

    RowsHandler(String sheet, Consumer<Row> consumer) {
      this.sheet = sheet;
      this.consumer = consumer;
    }

    public void startRow(int rowNum) {
      cells = new LinkedHashMap<>();
    }

    public void cell(String reference, String value, XSSFComment comment) {
      int col = new CellReference(reference).getCol();
      if (col >= 12 && col <= 48) return; // Ignore M:AW (original monthly data and totals).
      if (col >= 57 || value.length() > 10000) throw invalid();
      if (!value.isEmpty()) cells.put(CellReference.convertNumToColString(col), value);
    }

    public void endRow(int rowNum) {
      if (rowNum == 1) {
        header =
            "수용가번호".equals(cells.get("C"))
                && "수용가명".equals(cells.get("D"))
                && "새주소".equals(cells.get("E"));
        if (!header) throw invalid();
      }
      if (rowNum > 1 && !cells.isEmpty()) {
        if (!header) throw invalid();
        consumer.accept(new Row(sheet, rowNum + 1, cells, hidden));
      }
    }
  }
}
