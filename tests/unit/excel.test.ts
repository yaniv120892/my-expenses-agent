import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseWorkbook,
  getFirstSheet,
  sheetToText,
  sheetRows,
  isEmptyRow,
  chunkRows,
  formatChunkForAI,
  rowToRawData,
  ExcelRow,
} from "../../src/mastra/lib/excel";

function makeWorkbookBuffer(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseWorkbook / sheetRows", () => {
  it("round-trips rows through an xlsx buffer", () => {
    const buffer = makeWorkbookBuffer([
      ["תאריך", "תיאור", "סכום"],
      ["01/07/2025", "סופר", "120.5"],
    ]);
    const workbook = parseWorkbook(buffer);
    const rows = sheetRows(getFirstSheet(workbook));
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("סופר");
  });
});

describe("sheetToText", () => {
  it("includes the filename and 1-based row labels", () => {
    const buffer = makeWorkbookBuffer([["a", "b"], ["c", "d"]]);
    const text = sheetToText(getFirstSheet(parseWorkbook(buffer)), "f.xlsx");
    expect(text).toContain("File: f.xlsx");
    expect(text).toContain("Row 1: a | b");
    expect(text).toContain("Row 2: c | d");
  });

  it("caps the preview at 26 rows and 11 columns", () => {
    const wide = Array.from({ length: 40 }, (_, r) =>
      Array.from({ length: 20 }, (_, c) => `r${r}c${c}`)
    );
    const text = sheetToText(getFirstSheet(parseWorkbook(makeWorkbookBuffer(wide))), "f.xlsx");
    expect(text).toContain("Row 26:");
    expect(text).not.toContain("Row 27:");
    expect(text).toContain("r0c10");
    expect(text).not.toContain("r0c11");
  });
});

describe("isEmptyRow", () => {
  it("treats missing/blank cells as empty", () => {
    expect(isEmptyRow([])).toBe(true);
    expect(isEmptyRow([undefined, null, "  "])).toBe(true);
    expect(isEmptyRow(["", "x"])).toBe(false);
  });
});

describe("chunkRows", () => {
  it("splits into fixed-size chunks with a remainder", () => {
    const chunks = chunkRows([1, 2, 3, 4, 5], 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when under the size", () => {
    expect(chunkRows([1], 200)).toEqual([[1]]);
  });
});

describe("formatChunkForAI", () => {
  it("uses absolute row indices and the mapped columns", () => {
    const rows: ExcelRow[] = [
      ["01/07/2025", "Coffee", "18"],
      ["02/07/2025", "Groceries", "230"],
    ];
    const chunk = rows.map((row, i) => ({ row, index: i + 150 }));
    const text = formatChunkForAI(chunk, { date: 0, description: 1, amount: 2 });
    expect(text).toContain('Row 151: Date="01/07/2025" | Description="Coffee" | Amount="18"');
    expect(text).toContain('Row 152: Date="02/07/2025"');
  });
});

describe("rowToRawData", () => {
  it("keys cells by column index and skips empty cells", () => {
    expect(rowToRawData(["a", undefined, 3, "", null])).toEqual({
      "0": "a",
      "2": 3,
    });
  });
});
