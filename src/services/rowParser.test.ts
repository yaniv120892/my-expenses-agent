import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { detectCurrency } from "./currency";
import {
  findStatedTotal,
  readSheetTransactions,
  parseCellAmount,
  parseCellDate,
  parseTransactionRows,
} from "./rowParser";

const CAL_MAPPINGS = { date: 0, description: 1, amount: 2, chargedAmount: 3 };

describe("parseCellDate", () => {
  it("reads an Excel serial as a day-first date", () => {
    assert.equal(parseCellDate(46242), "08/08/2026");
  });

  it("reads day-first text with a two- or four-digit year", () => {
    assert.equal(parseCellDate("8/8/26"), "08/08/2026");
    assert.equal(parseCellDate("31.12.2025"), "31/12/2025");
  });

  it("reads an ISO date", () => {
    assert.equal(parseCellDate("2026-07-05"), "05/07/2026");
  });

  it("is null for text that is not a date", () => {
    assert.equal(parseCellDate("שם בית עסק"), null);
    assert.equal(parseCellDate(""), null);
    assert.equal(parseCellDate(undefined), null);
  });
});

describe("parseCellAmount", () => {
  it("passes a numeric cell through", () => {
    assert.equal(parseCellAmount(140.4), 140.4);
    assert.equal(parseCellAmount(-37.06), -37.06);
  });

  it("reads a formatted currency string", () => {
    assert.equal(parseCellAmount("₪ 1,234.50"), 1234.5);
    assert.equal(parseCellAmount("-37.06 ₪"), -37.06);
  });

  it("is null for an empty or non-numeric cell", () => {
    assert.equal(parseCellAmount(null), null);
    assert.equal(parseCellAmount(""), null);
    assert.equal(parseCellAmount("רגילה"), null);
  });
});

describe("parseTransactionRows", () => {
  const calRows = [
    [46242, "טן הדרים נתניה", 140.4, 140.4, "רגילה", "אנרגיה"],
    [46234, "החזר CashPro", -37.06, null, "צבירה למועדון"],
    [46213, "א.י.ש קייטרינג אוכל בצבעים", 96, 96, "רגילה"],
    [],
    ["את המידע המלא על כל עסקה אפשר למצוא באתר", null, null, null, null],
  ];

  it("keeps the merchant verbatim and reads every row, credits included", () => {
    const transactions = parseTransactionRows(calRows, CAL_MAPPINGS);

    assert.deepEqual(transactions, [
      {
        date: "08/08/2026",
        description: "טן הדרים נתניה",
        value: 140.4,
        type: "EXPENSE",
        rawData: {},
        originalAmount: 140.4,
        chargedAmount: 140.4,
      },
      {
        date: "31/07/2026",
        description: "החזר CashPro",
        value: 37.06,
        type: "INCOME",
        rawData: {},
        originalAmount: 37.06,
      },
      {
        date: "10/07/2026",
        description: "א.י.ש קייטרינג אוכל בצבעים",
        value: 96,
        type: "EXPENSE",
        rawData: {},
        originalAmount: 96,
        chargedAmount: 96,
      },
    ]);
  });

  it("prefers the billed amount when both columns are numeric", () => {
    const [transaction] = parseTransactionRows(
      [[46242, "Foreign Merchant", 25.0, 92.35, "רגילה"]],
      CAL_MAPPINGS
    );
    assert.equal(transaction.value, 92.35);
  });

  it("falls back to the single amount column when no billed column is mapped", () => {
    const [transaction] = parseTransactionRows(
      [["05/07/2026", "Some Shop", "₪ 12.50"]],
      { date: 0, description: 1, amount: 2 }
    );
    assert.deepEqual(transaction, {
      date: "05/07/2026",
      description: "Some Shop",
      value: 12.5,
      type: "EXPENSE",
      rawData: {},
      originalAmount: 12.5,
      originalCurrency: "ILS",
    });
  });

  it("skips rows without a date, a description or an amount", () => {
    const transactions = parseTransactionRows(
      [
        ["not a date", "Shop", 10, 10],
        [46242, "", 10, 10],
        [46242, "Shop", null, null],
        [46242, "Shop", 0, 0],
      ],
      CAL_MAPPINGS
    );
    assert.equal(transactions.length, 0);
  });
});

describe("parseTransactionRows currency", () => {
  it("keeps the original foreign amount beside the billed one", () => {
    const [transaction] = parseTransactionRows(
      [[46242, "Foreign Merchant", 25, 92.35]],
      CAL_MAPPINGS,
      [["08/08/2026", "Foreign Merchant", "$25.00", "₪92.35"]]
    );
    assert.deepEqual(transaction, {
      date: "08/08/2026",
      description: "Foreign Merchant",
      value: 92.35,
      type: "EXPENSE",
      rawData: {},
      originalAmount: 25,
      originalCurrency: "USD",
      chargedAmount: 92.35,
      chargedCurrency: "ILS",
    });
  });

  it("reads the currency from a dedicated column", () => {
    const [transaction] = parseTransactionRows(
      [[46242, "Hotel", 100, 380.1, "EUR"]],
      { ...CAL_MAPPINGS, currency: 4 }
    );
    assert.equal(transaction.originalCurrency, "EUR");
    assert.equal(transaction.originalAmount, 100);
  });

  it("flags an unlabelled refund without a billed amount on a statement with foreign rows", () => {
    const transactions = parseTransactionRows(
      [
        [46242, "Foreign Merchant", 25, 92.35],
        [46243, "Refund", -10, null],
      ],
      CAL_MAPPINGS,
      [
        ["08/08/2026", "Foreign Merchant", "$25.00", "92.35"],
        ["09/08/2026", "Refund", "-10.00", ""],
      ]
    );
    assert.equal(transactions[1].type, "INCOME");
    assert.equal(transactions[1].originalAmount, 10);
    assert.equal(transactions[1].chargedAmount, undefined);
    assert.equal(transactions[1].currencyAmbiguous, true);
    assert.equal(transactions[0].currencyAmbiguous, undefined);
  });

  it("does not let an instalment make the statement look foreign", () => {
    const transactions = parseTransactionRows(
      [
        [46242, "Sofa", 1200, 400],
        [46243, "Refund", -50, null],
      ],
      CAL_MAPPINGS
    );
    assert.equal(transactions[1].currencyAmbiguous, undefined);
  });

  it("does not flag unlabelled rows on a statement with no billed column", () => {
    const transactions = parseTransactionRows(
      [
        [46242, "Foreign Merchant", 25],
        [46243, "Shop", 40],
      ],
      { date: 0, description: 1, amount: 2 },
      [
        ["08/08/2026", "Foreign Merchant", "$25.00"],
        ["09/08/2026", "Shop", "40.00"],
      ]
    );
    assert.equal(transactions[0].originalCurrency, "USD");
    assert.equal(transactions[1].currencyAmbiguous, undefined);
  });

  it("does not flag an unlabelled refund on a single-currency statement", () => {
    const transactions = parseTransactionRows(
      [
        [46242, "Shop", 40, 40],
        [46243, "Refund", -10, null],
      ],
      CAL_MAPPINGS
    );
    assert.equal(transactions[1].currencyAmbiguous, undefined);
  });

  it("keeps a labelled foreign refund without a billed amount in its own currency", () => {
    const [transaction] = parseTransactionRows(
      [[46243, "Refund", -10, null]],
      CAL_MAPPINGS,
      [["09/08/2026", "Refund", "-€10.00", ""]]
    );
    assert.equal(transaction.originalCurrency, "EUR");
    assert.equal(transaction.currencyAmbiguous, undefined);
  });

  it("flags a symbol that names several currencies", () => {
    const [transaction] = parseTransactionRows(
      [[46243, "Ramen", 1200, 30.5]],
      CAL_MAPPINGS,
      [["09/08/2026", "Ramen", "¥1,200", "30.50"]]
    );
    assert.equal(transaction.originalCurrency, undefined);
    assert.equal(transaction.currencyAmbiguous, true);
    assert.equal(transaction.value, 30.5);
  });
});

describe("readSheetTransactions", () => {
  it("reads the currency a numeric cell carries only in its number format", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["date", "merchant", "amount", "billed"],
      [46242, "Foreign Merchant", 25, 92.35],
    ]);
    sheet["C2"].z = '"$"#,##0.00';
    sheet["D2"].z = "[$₪-40D] #,##0.00";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "statement");
    const reread = XLSX.read(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
      { type: "buffer" }
    );

    const { transactions } = readSheetTransactions(
      reread.Sheets.statement,
      CAL_MAPPINGS,
      1
    );

    assert.equal(transactions[0].originalCurrency, "USD");
    assert.equal(transactions[0].chargedCurrency, "ILS");
    assert.equal(transactions[0].value, 92.35);
  });
});

describe("findStatedTotal", () => {
  it("reads the total from a Cal title row", () => {
    assert.equal(
      findStatedTotal([
        ["פירוט עסקאות לחשבון ... המסתיים ב-6125"],
        [],
        ["עסקאות לחיוב ב-10/08/2026: 3,083.91 ₪"],
      ]),
      3083.91
    );
  });

  it("is null when no title row states a total", () => {
    assert.equal(findStatedTotal([["פירוט עסקאות"], []]), null);
  });
});

describe("detectCurrency", () => {
  it("resolves symbols and ISO codes", () => {
    assert.deepEqual(detectCurrency("$ 12.00"), { kind: "code", code: "USD" });
    assert.deepEqual(detectCurrency("US$12"), { kind: "code", code: "USD" });
    assert.deepEqual(detectCurrency("12.00 ₪"), { kind: "code", code: "ILS" });
    assert.deepEqual(detectCurrency('ש"ח'), { kind: "code", code: "ILS" });
    assert.deepEqual(detectCurrency("€5"), { kind: "code", code: "EUR" });
    assert.deepEqual(detectCurrency("GBP"), { kind: "code", code: "GBP" });
    assert.deepEqual(detectCurrency("CHF 9.90"), { kind: "code", code: "CHF" });
  });

  it("finds nothing in a bare number", () => {
    assert.deepEqual(detectCurrency("1,234.50"), { kind: "none" });
    assert.deepEqual(detectCurrency(""), { kind: "none" });
  });

  it("calls a shared or conflicting marker ambiguous", () => {
    assert.equal(detectCurrency("¥100").kind, "ambiguous");
    assert.equal(detectCurrency("C$20").kind, "ambiguous");
    assert.equal(detectCurrency("100 kr").kind, "ambiguous");
    assert.equal(detectCurrency("USD €").kind, "ambiguous");
  });

  it("ignores three-letter words that are not currencies", () => {
    assert.deepEqual(detectCurrency("ABC"), { kind: "none" });
    assert.deepEqual(detectCurrency("12.00 NIS"), { kind: "code", code: "ILS" });
  });

  it("reads only an unqualified or American dollar as USD", () => {
    assert.deepEqual(detectCurrency("100 דולר"), { kind: "code", code: "USD" });
    assert.deepEqual(detectCurrency('דולר ארה"ב'), { kind: "code", code: "USD" });
    assert.deepEqual(detectCurrency("דולר אמריקאי"), { kind: "code", code: "USD" });
    assert.equal(detectCurrency("דולר קנדי").kind, "ambiguous");
    assert.equal(detectCurrency("דולר אוסטרלי").kind, "ambiguous");
  });
});
