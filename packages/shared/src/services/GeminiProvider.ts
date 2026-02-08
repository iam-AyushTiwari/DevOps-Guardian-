// packages/shared/src/services/GeminiProvider.ts
import { GoogleGenAI } from "@google/genai";
import { db } from "../db.js";
import { AgentStatus } from "../index.js";

export class GeminiProvider {
  private client: any;

  constructor(apiKey: string) {
    if (!apiKey) {
      // ⚠️ CRITICAL: The API might be receiving "undefined" as a string
      throw new Error("GeminiProvider: API Key is missing or undefined.");
    }
    // New unified client initialization
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateWithReasoning(
    prompt: string,
    incidentId: string,
    agentName: string,
    images: string[] = [],
    cachedContentName?: string, // Support for Context Caching
    modelOverride?: string, // Allow agents to request specific models (e.g., gemini-3-pro-preview)
  ): Promise<string> {
    try {
      // Primary: Gemini 3 Flash Preview (PhD-level reasoning, optimized for speed)
      const primaryModel = modelOverride || "gemini-3-flash-preview";

      if (images.length > 0) {
        console.log(
          `[GeminiProvider] 📸 Activating Gemini 3 Multimodal Preview (${primaryModel}) for ${images.length} images`,
        );
      } else {
        console.log(
          `[GeminiProvider] Attempting model: ${primaryModel} ${cachedContentName ? `with cache: ${cachedContentName}` : ""}`,
        );
      }

      // Construct Multi-modal Content
      const parts: any[] = [{ text: prompt }];

      // images is array of base64 strings (data:image/png;base64,...)
      images.forEach((img) => {
        const base64Data = img.split(",")[1] || img;
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        });
      });

      // Config with Caching Support
      const config: any = {
        thinkingConfig: {
          includeThoughts: true,
        },
      };

      // If cached content provided, use it
      let contents: any[] = [{ role: "user", parts }];
      let model = primaryModel;

      // NOTE: Caching API interaction often happens *outside* generateContent in some SDK versions,
      // or passed as 'cachedContent' property in the request.
      // For @google/genai, it's often:
      // client.models.generateContent({ model: '...', contents: ..., cachedContent: 'name' })

      if (cachedContentName) {
        config.cachedContent = cachedContentName;
      }

      try {
        const result = await this.client.models.generateContent({
          model: primaryModel,
          contents,
          config,
        });
        return await this.processResult(result, incidentId, agentName);
      } catch (err: any) {
        // Handle Rate Limits (429) for Primary
        if (err.status === 429) {
          console.warn("[GeminiProvider] Primary Model Rate Limit hit. Waiting 5s...");
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const result = await this.client.models.generateContent({
              model: primaryModel,
              contents,
              config,
            });
            return await this.processResult(result, incidentId, agentName);
          } catch (e) {
            console.warn("[GeminiProvider] Primary Retry failed. Switching to Fallback.");
          }
        }

        // Fallback: Gemini 3 Flash Preview
        const fallbackModel = "gemini-3-flash-preview";
        console.warn(`[GeminiProvider] Switching to fallback: ${fallbackModel}`);

        try {
          const fallbackConfig = cachedContentName ? { cachedContent: cachedContentName } : {};
          const result = await this.client.models.generateContent({
            model: fallbackModel,
            contents,
            config: fallbackConfig,
          });
          return await this.processResult(result, incidentId, agentName);
        } catch (fallbackErr: any) {
          // If fallback also hitting rate limit, try one last time after delay
          if (fallbackErr.status === 429) {
            console.warn("[GeminiProvider] Fallback Rate Limit hit. Final retry in 5s...");
            await new Promise((r) => setTimeout(r, 5000));
            const result = await this.client.models.generateContent({
              model: fallbackModel,
              contents,
              config: cachedContentName ? { cachedContent: cachedContentName } : {},
            });
            return await this.processResult(result, incidentId, agentName);
          }
          throw fallbackErr;
        }
      }
    } catch (error: any) {
      console.error("[RCA] Failed:", error);

      await db.agentRun.create({
        data: {
          incidentId,
          agentName,
          status: AgentStatus.FAILED,
          thoughts: `Error: ${error.message}`,
          output: { error: error.message, stack: error.stack },
        },
      });

      throw error;
    }
  }

  /**
   * Caches a large text context (like a repo dump) for 1 hour.
   * Returns the `cachedContent.name` (resource ID).
   */
  async cacheContext(key: string, content: string, ttlSeconds: number = 3600): Promise<string> {
    try {
      console.log(`[GeminiProvider] Caching context for key: ${key} (${content.length} chars)...`);

      // 1. Upload File (Text)
      // Convert string to Buffer
      const buffer = Buffer.from(content);

      // @google/genai "files" namespace usage
      // Note: SDK structure might vary, adapting to common pattern
      const uploadResponse = await this.client.files.upload({
        file: {
          metadata: {
            displayName: key,
            mimeType: "text/plain",
          },
        },
        media: {
          mimeType: "text/plain",
          body: buffer,
        },
      });

      const fileUri = uploadResponse.file.uri;
      console.log(`[GeminiProvider] File uploaded: ${fileUri}`);

      // 2. Create Cache
      const cacheResponse = await this.client.caches.create({
        model: "models/gemini-3-flash", // Must match model used
        contents: [
          {
            role: "user",
            parts: [{ fileData: { fileUri, mimeType: "text/plain" } }],
          },
        ],
        ttlSeconds, // "300s" string or number depending on SDK. Trying number.
      });

      console.log(`[GeminiProvider] Cache created: ${cacheResponse.name}`);
      return cacheResponse.name;
    } catch (e: any) {
      console.warn("[GeminiProvider] Caching failed (skipping):", e.message);
      return ""; // Return empty to fallback to normal context
    }
  }

  private async processResult(result: any, incidentId: string, agentName: string) {
    // 💡 Access text and reasoning directly from the result
    const finalResponse = result.text;
    const rawThoughts = result.reasoning; // Might be undefined on fallback

    // Persist to DB
    await db.agentRun.create({
      data: {
        incidentId: incidentId,
        agentName: agentName,
        status: AgentStatus.COMPLETED,
        thoughts: rawThoughts || "No reasoning trace (Fallback Model used).",
        output: { text: finalResponse || "No text generated" },
      },
    });

    return finalResponse || "";
  }

  // Simple generate without DB logging (for Patch Agent)
  async generate(prompt: string): Promise<string> {
    try {
      const model = "gemini-3-flash-preview"; // Use stable model for code gen
      console.log(`[GeminiProvider] Generating content with: ${model}`);

      const result = await this.client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return result.text || "";
    } catch (error: any) {
      console.error("[GeminiProvider] Generate failed:", error);
      throw error;
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.client.models.embedContent({
        model: "text-embedding-004",
        contents: [
          {
            parts: [
              {
                text: text,
              },
            ],
          },
        ],
      });
      if (result.embeddings && result.embeddings.length > 0) {
        return result.embeddings[0].values;
      }
      throw new Error("No embeddings returned from Gemini API");
    } catch (error) {
      console.error("[GeminiProvider] Embedding failed:", error);
      throw error;
    }
  }
}
