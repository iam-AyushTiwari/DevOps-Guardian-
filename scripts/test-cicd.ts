import axios from "axios";

const API_URL = "http://localhost:3001";
const PROJECT_ID = process.argv[2];

if (!PROJECT_ID) {
  console.error("Usage: npx tsx test-cicd.ts <PROJECT_ID>");
  process.exit(1);
}

const mockErrorPayload = {
  message: `Build failed: ReferenceError: 'config' is not defined in lib/utils.js (run_${Date.now()})`,
  service: "build-pipeline",
  environment: "ci-cd",
  severity: "CRITICAL",
};

async function triggerError() {
  try {
    console.log(`📡 Sending mock CI/CD error for project ${PROJECT_ID}...`);
    const response = await axios.post(`${API_URL}/api/v1/logs/${PROJECT_ID}`, mockErrorPayload);
    console.log("✅ Success! Check the dashboard or Slack.");
    console.log("Response:", response.data);
  } catch (error: any) {
    console.error("❌ Failed:", error.response?.data || error.message);
  }
}

triggerError();
