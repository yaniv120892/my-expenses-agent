import { describe, it, expect } from "vitest";
import {
  filterValidTransactions,
  cleanDescription,
  cleanTransactionDescriptions,
} from "../../src/mastra/lib/clean";
import { ExtractedTransaction } from "../../src/mastra/types/schemas";

const valid: ExtractedTransaction = {
  date: "15/07/2025",
  description: "Super Market",
  value: 120.5,
  type: "EXPENSE",
  rawData: {},
};

describe("filterValidTransactions", () => {
  it("keeps valid transactions", () => {
    expect(filterValidTransactions([valid])).toHaveLength(1);
  });

  it("drops transactions with non-positive value", () => {
    const zero = { ...valid, value: 0 };
    const negative = { ...valid, value: -5 };
    expect(filterValidTransactions([zero, negative, valid])).toHaveLength(1);
  });

  it("drops transactions with empty description or date", () => {
    const noDescription = { ...valid, description: "   " };
    const noDate = { ...valid, date: "" };
    expect(
      filterValidTransactions([noDescription, noDate, valid])
    ).toHaveLength(1);
  });

  it("drops transactions with invalid type", () => {
    const badType = { ...valid, type: "TRANSFER" as "EXPENSE" };
    expect(filterValidTransactions([badType])).toHaveLength(0);
  });
});

describe("cleanDescription", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanDescription("  Super   Market  ")).toBe("Super Market");
  });

  it("preserves Hebrew characters", () => {
    expect(cleanDescription("סופר מרקט")).toBe("סופר מרקט");
  });

  it("strips punctuation and symbols but keeps word characters", () => {
    expect(cleanDescription("Caffe*-Nero! (TLV)")).toBe("CaffeNero TLV");
  });

  it("truncates to 200 characters", () => {
    expect(cleanDescription("a".repeat(250))).toHaveLength(200);
  });

  it("returns empty string for falsy input", () => {
    expect(cleanDescription("")).toBe("");
  });
});

describe("cleanTransactionDescriptions", () => {
  it("cleans every transaction's description without touching other fields", () => {
    const result = cleanTransactionDescriptions([
      { ...valid, description: " קניות!!  ברשת " },
    ]);
    expect(result[0].description).toBe("קניות ברשת");
    expect(result[0].value).toBe(valid.value);
    expect(result[0].date).toBe(valid.date);
  });
});
