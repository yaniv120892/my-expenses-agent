import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findStatedTotal,
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
      },
      {
        date: "31/07/2026",
        description: "החזר CashPro",
        value: 37.06,
        type: "INCOME",
        rawData: {},
      },
      {
        date: "10/07/2026",
        description: "א.י.ש קייטרינג אוכל בצבעים",
        value: 96,
        type: "EXPENSE",
        rawData: {},
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
