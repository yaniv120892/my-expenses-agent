import * as fs from "node:fs";
import * as path from "node:path";

const SERVICE_URL = process.env.SERVICE_URL || "http://localhost:4111";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3004/webhook";
const TEST_FILE_URL = process.env.TEST_FILE_URL;
const TEST_USER_ID =
  process.env.TEST_USER_ID || "550e8400-e29b-41d4-a716-446655440000";

interface JsonResponse {
  status: number;
  data: any;
}

async function getJson(url: string): Promise<JsonResponse> {
  const response = await fetch(url);
  return { status: response.status, data: await response.json() };
}

async function postJson(url: string, body: unknown): Promise<JsonResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

async function testAsyncService() {
  console.log("Testing Async Excel extraction service...");

  if (!TEST_FILE_URL) {
    console.log(
      "❌ TEST_FILE_URL env var is required (an S3 URL the service can download)."
    );
    console.log(
      '   Example: TEST_FILE_URL="https://<bucket>.s3.<region>.amazonaws.com/imports/<file>.xlsx" npm test'
    );
    process.exit(1);
  }

  try {
    console.log("1. Testing health check...");
    const healthResponse = await getJson(`${SERVICE_URL}/api/health`);
    console.log("✅ Health check passed:", healthResponse.data);

    console.log("2. Testing async extraction endpoint...");
    const testRequest = {
      fileUrl: TEST_FILE_URL,
      filename: "test-file.xlsx",
      userId: TEST_USER_ID,
      webhookUrl: WEBHOOK_URL,
      options: {
        confidenceThreshold: 0.7,
        maxRetries: 2,
        includeRawData: false,
      },
    };

    const asyncResponse = await postJson(
      `${SERVICE_URL}/api/extract`,
      testRequest
    );
    if (asyncResponse.status >= 400) {
      console.log(
        "❌ Extraction request failed:",
        asyncResponse.status,
        asyncResponse.data
      );
      return;
    }
    console.log("✅ Async extraction request submitted:", asyncResponse.data);

    const requestId = asyncResponse.data.requestId;
    console.log(`\n3. Polling status for request: ${requestId}`);

    let attempts = 0;
    const maxAttempts = 60;
    let isCompleted = false;

    while (attempts < maxAttempts && !isCompleted) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;

      try {
        const statusResponse = await getJson(
          `${SERVICE_URL}/api/status/${requestId}`
        );

        const status = statusResponse.data;
        console.log(`   Attempt ${attempts}: Status = ${status.status}`);

        if (status.status === "COMPLETED") {
          console.log("✅ Extraction completed successfully!");
          console.log("📊 Result summary:", {
            transactionCount: status.result?.transactions?.length || 0,
            processingTime: status.result?.processingTime || 0,
            completedAt: status.completedAt,
          });

          if (status.result) {
            await writeTransactionsToFiles(status.result, testRequest.fileUrl);
          }
          isCompleted = true;
        } else if (status.status === "FAILED") {
          console.log("❌ Extraction failed:", status.error);
          isCompleted = true;
        }
      } catch (error: any) {
        console.log(
          `   Attempt ${attempts}: Error checking status - ${error.message}`
        );
      }
    }

    if (!isCompleted) {
      console.log("⏰ Timeout waiting for extraction to complete");
    }
  } catch (error: any) {
    if (error.cause?.code === "ECONNREFUSED") {
      console.log(
        "❌ Service is not running. Please start it with: npm run dev"
      );
    } else {
      console.log("❌ Test failed:", error.message);
    }
  }
}

async function writeTransactionsToFiles(
  extractionData: any,
  originalFileUrl?: string
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(process.cwd(), "extracted-transactions");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const transactions = extractionData.transactions;
  const metadata = extractionData.metadata;
  const structure = extractionData.structure;

  console.log(`\n📝 Writing ${transactions.length} transactions to files...`);

  if (originalFileUrl) {
    try {
      console.log("📥 Downloading original Excel file...");
      const fileResponse = await fetch(originalFileUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (!fileResponse.ok) {
        throw new Error(`HTTP ${fileResponse.status}`);
      }
      const fileData = Buffer.from(await fileResponse.arrayBuffer());
      const urlPath = new URL(originalFileUrl).pathname;
      const originalFilename = path.basename(urlPath) || "original-file.xlsx";
      const excelFilePath = path.join(
        outputDir,
        `original-${originalFilename}`
      );

      fs.writeFileSync(excelFilePath, fileData);
      console.log(`✅ Original Excel file saved: ${excelFilePath}`);
    } catch (error) {
      console.log(
        `⚠️  Failed to download original Excel file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      console.log(
        `   This is likely due to expired authentication tokens in the S3 URL.`
      );

      const urlFilePath = path.join(
        outputDir,
        `original-file-url-${timestamp}.txt`
      );
      fs.writeFileSync(
        urlFilePath,
        `Original Excel File URL:\n${originalFileUrl}\n\nNote: This URL may have expired authentication tokens.`
      );
      console.log(`✅ Original file URL saved for reference: ${urlFilePath}`);
    }
  }

  const jsonData = {
    metadata,
    structure,
    transactions,
    extractedAt: new Date().toISOString(),
    totalTransactions: transactions.length,
    originalFileUrl: originalFileUrl || null,
  };

  const jsonFilePath = path.join(outputDir, `transactions-${timestamp}.json`);
  fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
  console.log(`✅ JSON file written: ${jsonFilePath}`);

  const csvHeaders = ["Date", "Description", "Value", "Type"];
  const csvRows = transactions.map((tx: any) => [
    tx.date,
    tx.description,
    tx.value,
    tx.type,
  ]);

  const csvContent = [csvHeaders, ...csvRows]
    .map((row) => row.map((field: any) => `"${field}"`).join(","))
    .join("\n");

  const csvFilePath = path.join(outputDir, `transactions-${timestamp}.csv`);
  fs.writeFileSync(csvFilePath, csvContent);
  console.log(`✅ CSV file written: ${csvFilePath}`);

  const summaryContent = `
EXTRACTION SUMMARY
==================
Extracted At: ${new Date().toISOString()}
Total Transactions: ${transactions.length}
Processing Time: ${extractionData.processingTime}ms
${originalFileUrl ? `Original File URL: ${originalFileUrl}` : ""}

METADATA:
${metadata ? JSON.stringify(metadata, null, 2) : "No metadata available"}

STRUCTURE ANALYSIS:
${
  structure
    ? JSON.stringify(structure, null, 2)
    : "No structure analysis available"
}

PROCESSING NOTES:
${
  extractionData.processingNotes
    ? extractionData.processingNotes.join("\n")
    : "No processing notes"
}

TRANSACTIONS BREAKDOWN:
- Expenses: ${transactions.filter((tx: any) => tx.type === "EXPENSE").length}
- Income: ${transactions.filter((tx: any) => tx.type === "INCOME").length}
- Total Value: ${transactions
    .reduce((sum: number, tx: any) => sum + tx.value, 0)
    .toFixed(2)}
`;

  const summaryFilePath = path.join(outputDir, `summary-${timestamp}.txt`);
  fs.writeFileSync(summaryFilePath, summaryContent);
  console.log(`✅ Summary file written: ${summaryFilePath}`);

  console.log(`\n📊 Extraction Summary:`);
  console.log(`   • Total transactions: ${transactions.length}`);
  console.log(
    `   • Expenses: ${
      transactions.filter((tx: any) => tx.type === "EXPENSE").length
    }`
  );
  console.log(
    `   • Income: ${
      transactions.filter((tx: any) => tx.type === "INCOME").length
    }`
  );
  console.log(
    `   • Total value: ${transactions
      .reduce((sum: number, tx: any) => sum + tx.value, 0)
      .toFixed(2)}`
  );
  console.log(`   • Files saved to: ${outputDir}`);
}

testAsyncService();
