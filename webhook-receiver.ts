import express from "express";

const app = express();
const PORT = 3004;

app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("\n🔔 Webhook received!");
  console.log("📋 Webhook payload:", JSON.stringify(req.body, null, 2));

  const { requestId, status, result, error, completedAt } = req.body;

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

  res.status(200).json({ received: true });
});

app.listen(PORT, () => {
  console.log(
    `🔗 Webhook receiver listening on http://localhost:${PORT}/webhook`
  );
  console.log(
    "📝 Use this URL as webhookUrl in your async extraction requests"
  );
});
