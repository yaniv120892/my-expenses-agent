import { createServer } from "node:http";

const PORT = Number(process.env.WEBHOOK_RECEIVER_PORT || 3004);

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(body);
    } catch {
      // keep empty payload
    }

    console.log("\n🔔 Webhook received!");
    console.log("📋 Webhook payload:", JSON.stringify(payload, null, 2));

    const { requestId, status, result, error, completedAt } = payload as {
      requestId?: string;
      status?: string;
      result?: { transactions?: unknown[]; processingTime?: number };
      error?: string;
      completedAt?: string;
    };

    if (status === "COMPLETED") {
      console.log("✅ Extraction completed successfully!");
      console.log(`📊 Request ID: ${requestId}`);
      console.log(`⏰ Completed at: ${completedAt}`);
      console.log(`📈 Transaction count: ${result?.transactions?.length || 0}`);
      console.log(`⏱️  Processing time: ${result?.processingTime || 0}ms`);
    } else if (status === "FAILED") {
      console.log("❌ Extraction failed!");
      console.log(`📊 Request ID: ${requestId}`);
      console.log(`⏰ Failed at: ${completedAt}`);
      console.log(`🚨 Error: ${error}`);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  });
});

server.listen(PORT, () => {
  console.log(
    `🔗 Webhook receiver listening on http://localhost:${PORT}/webhook`
  );
  console.log(
    "📝 Use this URL as webhookUrl in your async extraction requests"
  );
});
