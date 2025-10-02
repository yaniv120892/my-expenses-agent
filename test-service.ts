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
        "https://my-expenses-private.s3.eu-west-3.amazonaws.com/imports/2d658b14-a669-439c-b7f6-163028793be6-4730_08_2025.xlsx?response-content-disposition=inline&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEJT%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCWV1LXdlc3QtMyJGMEQCIHj9BFr48YIqbYKxekLdM6i%2BTRR2Cclek%2B%2FbsmHxmVhzAiB1eRKAqkwL3kFksb1Q2MU31p8yXOHyaX5XtkyFX%2BHZZiq5AwgtEAMaDDg2ODI0Mjg2NzEyOSIMUzVLb3OjREVCpwPwKpYDr05fbjnCX8uYgXZpB%2B%2FXaEWYDYrwIfIjd7SjIIl6aqW3ZjfFAFtHx2BXRbq2BNbN0P6i9FnNGj2FhMVxu%2Fb01pfKdVRQd2UMqFbXGdXBYYNaeir3lgCXwhj5bdPCppqWLnhlsF2gd%2BF756BSoP3qylSIByWanSvqcaIG0tk5h2aSexq0OSZ3XfUefTE4agqlAuiz%2FGQuKclKdnK6LrxFvMsNB9WeNu9yFrKCmuAs6jcrpbDREofoa9GFmcMOMeRcC1M0IpYWcmt3GkzfRpB8MRSsPU%2FrJ9nxO0dvYuF7nJYdQW3ykEeRA30SzLr02x5uK7WecpA7S6bvmQPP%2B5Ay6DnzI%2BOKa0GBvif4N2sgu3KxVKjjzLF5%2BGslD4kMJcQd3gE3XA9IvNYlTLt0lELFInN8gOatsYImBwxsjQZDsDof5hKUgdm7WjQ3MNpCWh392KQ8wliwJFehIZ7nbjZkcRu1%2Bpjnxc29JU%2FRkFejnNcpxNmJy5WQj2B5uuInt8gGtf53fs1fWm7zkt6D1omm65hLL2wyGDCZgPnGBjrfAlIJMTdiadk0e8rtWWQWvXUsu0RWE1G7oUG9zlndsQBM0C5bXBMOpFucngHncTuE5LoXiUYphj8EzukMk08rl68xVMpgbK08cdeitose1aLFxELDW5MFuzaCeFecv3ptNnzfT7pYBMH8OJg2l4EEFe3GRBwZupAFMhWu1xucPhvvzOCSL5WrRigaTdA81T9%2Bmi6Ii1EVTxODgYeK4hsBffmg3iKlqi2Lunzg9cr%2BiabTR0IJ8Vy0z0ngVJrLxkx83YII78jjTC4iYs176mnWz4ANe%2F5N12wnz0D9ygtkZv8jWIZXo2HKcdgDMj2IuqGMXcBnF8BqejKY%2B7kaUw7CfzrJVDppMneWBE9p%2FpK7C7e0ThoPaXUEV%2Fk8JFg0P91y7CYIBvw0ifyeVdr5LV43TL37fDpzF5HJ5C%2FRLwDyKE0x%2FojJJaeYsqhhv5nFs2mfZmIYgz704Gt5qea86XueHQ%3D%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIA4UJ2OYO4Y7PPGRSD%2F20251002%2Feu-west-3%2Fs3%2Faws4_request&X-Amz-Date=20251002T114150Z&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&X-Amz-Signature=cb121c7a1d994e37cbf2c69b7aeed9460a46fe3ad69b34e2a92aa8e8cd21f1c2",
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
