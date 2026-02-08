import { MemoryAgent } from "./memory.js";
import {
  IAgent,
  AgentStatus,
  AgentResult,
  IncidentEvent,
  GeminiProvider,
  GitHubService,
} from "@devops-guardian/shared";

export class RCAAgent implements IAgent {
  name = "RCA Agent";
  status = AgentStatus.IDLE;
  private gemini: GeminiProvider;
  private memoryAgent?: MemoryAgent;

  constructor(apiKey: string, memoryAgent?: MemoryAgent) {
    this.gemini = new GeminiProvider(apiKey);
    this.memoryAgent = memoryAgent;
  }

  async execute(incident: IncidentEvent): Promise<AgentResult> {
    this.status = AgentStatus.WORKING;
    console.log(`[RCA] Starting analysis for: ${incident.title}`);

    // Helper to format past memories
    let distinctMemories = "";
    if (this.memoryAgent) {
      try {
        const similar = await this.memoryAgent.findSimilar(
          incident.description || incident.message,
          2,
        );
        if (similar.length > 0) {
          distinctMemories =
            "\nRelevant Past Incidents:\n" +
            similar.map((m) => `- [${m.type}] ${m.content}`).join("\n");
        }
      } catch (e) {
        console.warn("[RCA] Memory retrieval failed:", e);
      }
    }

    // --- Smarter Context Retrieval ---
    let repoContext = "";
    const meta = incident.metadata as any;

    if (meta?.owner && meta?.repo && meta?.token) {
      try {
        console.log(`[RCA] Fetching repository context for ${meta.owner}/${meta.repo}...`);
        const github = new GitHubService(meta.token);

        // 1. Get File Structure (to identifying tech stack)
        const structure = await github.getRepoStructure(meta.owner, meta.repo, "");
        const fileNames = Array.isArray(structure) ? structure.map((f: any) => f.name) : [];
        repoContext += `\nRepository Structure: ${fileNames.slice(0, 20).join(", ")}`;

        // 2. Fetch Key Config Files
        const configFiles = ["package.json", "requirements.txt", "Dockerfile", "go.mod", "pom.xml"];
        const foundConfigs = fileNames.filter((f) => configFiles.includes(f));

        for (const file of foundConfigs) {
          try {
            const content = await github.getFileContent(meta.owner, meta.repo, file);
            // Limit content size to avoid token overflow
            repoContext += `\n\n--- ${file} ---\n${content.substring(0, 1000)}`;
          } catch (err) {
            console.warn(`[RCA] Failed to read ${file}:`, err);
          }
        }
      } catch (error) {
        console.warn("[RCA] Failed to fetch repo context. Continuing without it.", error);
      }
    } else {
      console.log("[RCA] Skipping repo context (missing owner/repo/token in metadata)");
    }
    // --------------------------------

    // --------------------------------

    // 1. Context Caching Strategy
    let cacheName = "";
    if (repoContext.length > 500) {
      // Only cache if substantial
      const cacheKey = `rca-${meta?.owner}-${meta?.repo}-${new Date().toISOString().split("T")[0]}`; // Daily cache key per repo
      cacheName = await this.gemini.cacheContext(cacheKey, repoContext);
    }

    // 2. Context Assembly
    // If we have a cache, we DON'T need to include repoContext in the prompt again.
    const context = `
      Incident: ${incident.title}
      Source: ${incident.source}
      Message: ${incident.description}
      Logs: ${JSON.stringify(incident.metadata || {})}
      ${distinctMemories}
      
      ${!cacheName ? repoContext : "(Repository Context provided via Gemini Context Caching)"}
    `;

    // 3. Extract Images (Multimodal)
    const images: string[] = meta?.images || [];
    if (images.length > 0) {
      console.log(`[RCA] Found ${images.length} images in metadata. Using Multimodal analysis.`);
    }

    const prompt = `
      You are a Senior SRE. Analyze this incident context ${images.length > 0 ? "and the attached screenshots" : ""} to identify the Root Cause.
      ${distinctMemories ? "Consider the Relevant Past Incidents provided above in your analysis." : ""}
      ${cacheName ? "Refer to the cached Repository Context to understand the technology stack and dependencies." : repoContext ? "Use the Repository Structure and Config Files provided." : ""}
      ${images.length > 0 ? "VISUAL ANALYSIS: Correlate the error logs with the visual state shown in the screenshots." : ""}
      
      Provide a specific technical reason and a recommended fix.
      
      Start your response with:
      **Technology Stack:** [e.g. Node.js, Python, Go, etc.]
      
      Context:
      ${context}
    `;

    try {
      // 2. Call Gemini with "Thinking" (Reasoning Trace) + Images + Cache
      const analysis = await this.gemini.generateWithReasoning(
        prompt,
        incident.id,
        this.name,
        images,
        cacheName, // Pass cache name
        "gemini-3-pro-preview", // Use Pro for deeper reasoning
      );

      console.log(`[RCA] Analysis Complete.`);

      this.status = AgentStatus.COMPLETED;
      return {
        success: true,
        data: {
          analysis: analysis,
          // Extract specific fields if the model returns JSON
          confidence: 0.95,
        },
      };
    } catch (error: any) {
      console.error("[RCA] Failed:", error);
      this.status = AgentStatus.FAILED;
      return { success: false, error: error.message };
    }
  }
}
