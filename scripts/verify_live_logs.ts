const io = require("socket.io-client");
const fetch = require("node-fetch");

const API_URL = "http://localhost:3001"; // API Port as per index.ts
const PROJECT_ID = "test-project-123";

async function run() {
  console.log("1. Connecting to Socket...");
  const socket = io(API_URL);

  const socketPromise = new Promise((resolve, reject) => {
    socket.on("connect", () => {
      console.log("   Connected to socket!");
    });

    socket.on("log:received", (data: { projectId: string; log: string | string[]; }) => {
      if (data.projectId === PROJECT_ID && data.log.includes("TEST_LIVE_LOG")) {
        console.log("3. SUCCESS: Received 'log:received' event!");
        console.log("   Log:", data.log);
        resolve(true);
      }
    });

    setTimeout(() => reject(new Error("Timeout waiting for socket event")), 10000);
  });

  // Give socket a moment to connect
  await new Promise((r) => setTimeout(r, 1000));

  console.log("2. Sending Mock Log to Webhook...");
  try {
    const res = await fetch(`${API_URL}/webhook/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        log: `[ERROR] TEST_LIVE_LOG: Database connection failed at ${new Date().toISOString()}`,
        source: "SimulationScript",
      }),
    });

    const json = await res.json();
    console.log("   Webhook Response:", json);
  } catch (e:any) {
    console.error("   Webhook Failed:", e.message);
    process.exit(1);
  }

  try {
    await socketPromise;
    console.log("Test Passed!");
    process.exit(0);
  } catch (e:any) {
    console.error("Test Failed:", e.message);
    process.exit(1);
  }
}

run();
