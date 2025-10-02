import axios from "axios";

const SERVICE_URL = "http://localhost:3003";

async function testService() {
  console.log("Testing Excel extraction service...");

  try {
    console.log("1. Testing health check...");
    const healthResponse = await axios.get(`${SERVICE_URL}/api/health`);
    console.log("✅ Health check passed:", healthResponse.data);

    console.log("2. Testing extraction endpoint...");
    const testRequest = {
      fileUrl:
        "https://my-expenses-private.s3.eu-west-3.amazonaws.com/imports/2d658b14-a669-439c-b7f6-163028793be6-4730_08_2025.xlsx",
      filename: "test-file.xlsx",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      options: {
        confidenceThreshold: 0.7,
        maxRetries: 2,
        includeRawData: false,
      },
    };

    const extractionResponse = await axios.post(
      `${SERVICE_URL}/api/extract`,
      testRequest
    );
    console.log("✅ Extraction test passed:", extractionResponse.data);
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

testService();
