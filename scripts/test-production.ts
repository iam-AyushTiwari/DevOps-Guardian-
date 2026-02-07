import axios from "axios";

const API_URL = "http://localhost:3001";
const PROJECT_ID = process.argv[2];

if (!PROJECT_ID) {
  console.error("Usage: npx tsx test-production.ts <PROJECT_ID>");
  process.exit(1);
}

// 1. Simulate CloudWatch Error
const cloudWatchPayload = {
  logGroup: "/aws/lambda/checkout-service",
  logStream: "2023/10/27/[$LATEST]894572",
  owner: "123456789012",
  subscriptionFilters: ["ErrorFilter"],
  messageType: "DATA_MESSAGE",
  records: [
    {
      data: Buffer.from(
        JSON.stringify({
          timestamp: Date.now(),
          message:
            "[ERROR] PaymentGatewayTimeout: upstream connect error or disconnect/reset before headers. reset reason: connection failure",
          id: "cw-12345",
        }),
      ).toString("base64"),
    },
  ],
};

// 2. Simulate Datadog Error
const datadogPayload = {
  ddsource: "datadog",
  service: "payment-service",
  hostname: "prod-worker-01",
  message: "CRITICAL: Rate limit exceeded for API /v1/transactions. 429 Too Many Requests.",
  tags: "env:production,region:us-east-1",
  status: "error",
};

async function triggerProductionErrors() {
  try {
    console.log(`\n🚀 Sending CloudWatch Simulation to Project ${PROJECT_ID}...`);
    // Note: CloudWatch sends GZIP usually, but our endpoint handles JSON too
    const cwRes = await axios.post(`${API_URL}/api/v1/logs/${PROJECT_ID}`, cloudWatchPayload);
    console.log("✅ CloudWatch Event Sent:", cwRes.data);

    console.log(`\n🚀 Sending Datadog Simulation to Project ${PROJECT_ID}...`);
    const ddRes = await axios.post(`${API_URL}/api/v1/logs/${PROJECT_ID}`, datadogPayload);
    console.log("✅ Datadog Event Sent:", ddRes.data);

    console.log(
      "\nℹ️ Check the Dashboard! These should appear as 'Awaiting Approval' because they are Production errors.",
    );
  } catch (error: any) {
    console.error("❌ Failed:", error.response ? error.response.data : error.message);
  }
}

triggerProductionErrors();
