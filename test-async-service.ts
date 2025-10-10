import axios from "axios";
import * as fs from "fs";
import * as path from "path";

const SERVICE_URL = "http://localhost:3003";

async function testAsyncService() {
  console.log("Testing Async Excel extraction service...");

  try {
    console.log("1. Testing health check...");
    const healthResponse = await axios.get(`${SERVICE_URL}/api/health`);
    console.log("✅ Health check passed:", healthResponse.data);

    console.log("2. Testing async extraction endpoint...");
    const testRequest = {
      fileUrl:
        "https://my-expenses-private.s3.eu-west-3.amazonaws.com/imports/2cf4577a-3633-4578-a1ed-dda58bbc9c9a-%D7%A4%D7%99%D7%A8%D7%95%D7%98%20%D7%97%D7%99%D7%95%D7%91%D7%99%D7%9D%20%D7%9C%D7%9B%D7%A8%D7%98%D7%99%D7%A1%20%D7%95%D7%99%D7%96%D7%94%209114%20-%2004.07.25.xlsx?response-content-disposition=inline&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEFUaCWV1LXdlc3QtMyJHMEUCIFUk%2Bg7YxByGdhs5rXBS4wSHiLhAPY2nkPiQXhez7anIAiEAjkeq5kM%2FqkG8dJlJ8eJyP2JzIRKqdxwiYCLSm%2B%2B%2BLbYqwgMI7v%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARADGgw4NjgyNDI4NjcxMjkiDJDSV59D0jzO1facsSqWA1nRxJ2p2n7mMv%2BceLg8Rb4YOR4gtlt%2BCzvNQ9KIhdJKGJk0Sk44lH6sAVfkPCdvwYghAZKabI1dd1ngFH%2BtZVvQrbyTONli%2BlZ%2F5byhZ1HPylcgjFQBywWyCeqEFNbMjGP557TkIldBvxCLhzgffJZnxtsGBYBh98K38KAj46jOEe9hs2r15o962qfP7JA6qXTiWxtBeetj7G6V86p4Uapno7lebGHfwCvrmQZNmmPKvUeRtZgDmhH4VJiDSx3MZ9jWMyBiMYcXwZGx80uYPZVyZcjh529ewArko9naXCJ6me%2FYnaLWl%2FInRAra%2FmYUOkuiTf8p4lJfIP4UIuALzTyEIdfkInVSVlk3iv6S6whheqBuqFvWMNOfR0JRoNLTLPqzk9Wc73ZASVta2%2F1uG%2B3oMVHiHk7cDAorYxMpWZ4JiE%2BP8aEp1BiVukhQVnEsmdO5qMK4X7mziir77gvXoG2XoHIF66%2B%2Bml1u%2BVL31ywYmVWj1k1Cyb9MyNZvlgac4lfyH%2FUdell6OIxP3xzVIm%2FOo10aH3MwyfqjxwY63gK5Rw7KkbJ%2FknsuWXubivMwaIl2jQfb7q6MDNtsXIZWWvq2Gsr%2FT2aDwQYOJO3oCC0MUjH2gPSU8x%2Ft6OspgTBVogp%2FRSFMZCE39pvhm86vnc8H2rR9XPPv5jQNOBwih6lUK%2FJPNUK0SZ%2B3A2IvlaIFd81liMPvia4wFp95Cqj3cqsIrZjKof%2BQikfnlUqxkwWGPII8bLzlNe6%2B5Z9sra5x%2BqgXxIFK5%2FtH8hQaLzn%2Frryu0M170Gdb%2B9QzX%2BnW7B4E7WabI0oAkH0aN3n%2F0OOAepija9xPABAh6SlP2zS0NVs1MJvI%2FK6g9wXR5M16yXWLe5Du0py86WIDdCKOw3xntGVhqdflYouh4%2Bxab13mKcI7%2Bb2zBnahOLInBjPouHxIyaQT91ceFJxGbb6yoTQwKs54WAulrU0SjI5rqZn6Z%2BL1RnnHCcsU%2FwRMXo7iYDjH0WuETrhhV7j33msH7Q%3D%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIA4UJ2OYO4WAK7PKN4%2F20251010%2Feu-west-3%2Fs3%2Faws4_request&X-Amz-Date=20251010T123517Z&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&X-Amz-Signature=d34f64e4b78f08180a7ee46db787ed29cb35fac9f5632c3eeb00d698e372753a",
      filename: "test-file.xlsx",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      webhookUrl: "http://localhost:3004/webhook", // Webhook receiver endpoint
      options: {
        confidenceThreshold: 0.7,
        maxRetries: 2,
        includeRawData: false,
      },
    };

    const asyncResponse = await axios.post(
      `${SERVICE_URL}/api/extract`,
      testRequest
    );
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
        const statusResponse = await axios.get(
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
    if (error.response) {
      console.log(
        "❌ Test failed with response:",
        error.response.status,
        error.response.data
      );
    } else if (error.code === "ECONNREFUSED") {
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
  const outputDir = path.join(__dirname, "extracted-transactions");

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
      const fileResponse = await axios.get(originalFileUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      const urlPath = new URL(originalFileUrl).pathname;
      const originalFilename = path.basename(urlPath) || "original-file.xlsx";
      const excelFilePath = path.join(
        outputDir,
        `original-${originalFilename}`
      );

      fs.writeFileSync(excelFilePath, fileResponse.data);
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
