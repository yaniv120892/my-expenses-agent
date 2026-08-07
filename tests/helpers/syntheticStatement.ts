import * as XLSX from "xlsx";

export interface SyntheticTransaction {
  date: string;
  description: string;
  amount: number;
}

export interface SyntheticStatement {
  buffer: Buffer;
  transactions: SyntheticTransaction[];
  cardLastFour: string;
  paymentMonth: string;
  headerRow: number;
  dataStartRow: number;
}

const MERCHANTS = [
  "סופר מרקט שופרסל",
  "רמי לוי",
  "פז דלק",
  "Netflix",
  "Spotify",
  "מסעדת הבית",
  "בית מרקחת",
  "AMAZON EU",
  "רכבת ישראל",
  "קפה גרג",
];

// Builds an xlsx buffer shaped like an Israeli credit-card statement: Hebrew
// title rows carrying the card digits and billing month, a header row, then
// `rowCount` transaction rows.
export function buildSyntheticStatement(rowCount: number): SyntheticStatement {
  const cardLastFour = "9114";
  const paymentMonth = "07/2025";

  const transactions: SyntheticTransaction[] = Array.from(
    { length: rowCount },
    (_, i) => ({
      date: `${String((i % 28) + 1).padStart(2, "0")}/06/2025`,
      description: MERCHANTS[i % MERCHANTS.length],
      amount: Math.round((20 + (i % 40) * 13.7) * 100) / 100,
    })
  );

  const rows: (string | number)[][] = [
    [`פירוט עסקאות לכרטיס ויזה ${cardLastFour}`],
    [`מועד חיוב: ${paymentMonth}`],
    ["תאריך עסקה", "שם בית עסק", "סכום חיוב"],
    ...transactions.map((t) => [t.date, t.description, t.amount]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  return {
    buffer,
    transactions,
    cardLastFour,
    paymentMonth,
    headerRow: 2,
    dataStartRow: 3,
  };
}
