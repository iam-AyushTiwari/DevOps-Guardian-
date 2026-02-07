import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is missing in .env");
    process.exit(1);
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    console.log("🔍 Fetching available models for your API key...");

    // Note: The specific method to list models might vary by SDK version.
    // Trying the standard pattern for @google/genai
    const response = await client.models.list();

    // The response structure depends on the SDK version, handling likely format:
    const models = (response as any).models || (response as any).data?.models || response;

    if (Array.isArray(models)) {
      console.log(`\n✅ Found ${models.length} models:\n`);

      // Group by family for better readability
      const families: Record<string, string[]> = {
        "Gemini 2": [],
        "Gemini 1.5": [],
        "Gemini 1.0": [],
        Other: [],
      };

      models.forEach((m: any) => {
        const name = m.name?.replace("models/", "") || m.id;
        const displayName = m.displayName || name;
        const formatted = `- ${name} (${displayName})`;

        if (name.includes("gemini-2")) families["Gemini 2"].push(formatted);
        else if (name.includes("gemini-1.5")) families["Gemini 1.5"].push(formatted);
        else if (name.includes("gemini-1.0")) families["Gemini 1.0"].push(formatted);
        else families["Other"].push(formatted);
      });

      Object.entries(families).forEach(([family, items]) => {
        if (items.length > 0) {
          console.log(`\n--- ${family} ---`);
          items.sort().forEach((i) => console.log(i));
        }
      });
    } else {
      console.log("Raw response:", JSON.stringify(models, null, 2));
    }
  } catch (error: any) {
    console.error("❌ Failed to list models:", error.message);
    if (error.status === 403) {
      console.error("   (Check if your API key has the correct permissions)");
    }
  }
}

listModels();
