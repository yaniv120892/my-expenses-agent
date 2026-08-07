import { ExtractedTransaction } from "../types/schemas";

export function filterValidTransactions(
  transactions: ExtractedTransaction[]
): ExtractedTransaction[] {
  return transactions.filter((transaction) => isValidTransaction(transaction));
}

function isValidTransaction(transaction: ExtractedTransaction): boolean {
  try {
    return !!(
      transaction.date &&
      transaction.description &&
      transaction.description.trim() &&
      transaction.value &&
      transaction.value > 0 &&
      transaction.type &&
      ["EXPENSE", "INCOME"].includes(transaction.type)
    );
  } catch {
    return false;
  }
}

export function cleanTransactionDescriptions(
  transactions: ExtractedTransaction[]
): ExtractedTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    description: cleanDescription(transaction.description),
  }));
}

export function cleanDescription(description: string): string {
  if (!description) return "";

  return description
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\u0590-\u05FF]/g, "")
    .substring(0, 200);
}
