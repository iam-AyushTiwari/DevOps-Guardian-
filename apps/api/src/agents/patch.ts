import {
  IAgent,
  AgentStatus,
  AgentResult,
  IncidentEvent,
  GeminiProvider,
  GitHubService,
} from "@devops-guardian/shared";

export class PatchAgent implements IAgent {
  name = "Patch Agent";
  status = AgentStatus.IDLE;
  private gemini: GeminiProvider;

  constructor(apiKey?: string) {
    this.gemini = new GeminiProvider(apiKey || process.env.GEMINI_API_KEY || "");
  }

  async execute(
    incident: IncidentEvent,
    rcaContext: any,
    previousFailures?: string[],
  ): Promise<AgentResult> {
    this.status = AgentStatus.WORKING;
    console.log(
      `[Patch] Generating fix for: ${incident.title} ${previousFailures ? "(Retry Attempt)" : ""}`,
    );

    // Extract metadata
    const metadata = incident.metadata as any;
    const owner = metadata?.owner;
    const repo = metadata?.repo;
    const token = metadata?.token;

    // If we don't have repo context, we can't fetch real code
    if (!rcaContext?.analysis) {
      console.warn("[Patch] No RCA analysis provided. Returning empty result.");
      this.status = AgentStatus.FAILED;
      return { success: false, error: "Missing RCA context" };
    }

    try {
      // 1. Build prompt for Gemini
      const prompt = `
You are a Senior Software Engineer. Based on the following Root Cause Analysis, generate a code fix.

## Incident
Title: ${incident.title}
Description: ${incident.description || incident.message}

## Root Cause Analysis
${typeof rcaContext.analysis === "string" ? rcaContext.analysis : JSON.stringify(rcaContext.analysis)}

${
  previousFailures && previousFailures.length > 0
    ? `
## ⚠️ PREVIOUS ATTEMPT FAILED
The previous fix failed verification with the following errors. YOU MUST ADDRESS THESE ERRORS.
Errors:
${previousFailures.join("\n")}
`
    : ""
}

## Instructions
1. Analyze the file paths and code snippets in the RCA.
2. DETECT the programming language (Python, Node.js, Go, etc.) context.
3. GENERATE code ONLY in the detected language.
   - DO NOT rewrite Python files as TypeScript/JavaScript.
   - DO NOT introduce new dependencies unless absolutely necessary.
4. Generate the COMPLETE fixed file content.
5. Respond in JSON format:

\`\`\`json
{
  "fileUpdates": [
    {
      "path": "path/to/file.<ext>",
      "content": "// The complete fixed file content here..."
    }
  ],
  "explanation": "Brief explanation of the fix (mention how it addresses the failure if applicable)"
}
\`\`\`

IMPORTANT: Return ONLY the JSON. No markdown code blocks outside of the JSON structure.
Match the file extension to the existing project language (e.g., .py for Python, .ts for TypeScript).
`;

      // 2. Call Gemini
      console.log("[Patch] Calling Gemini for fix generation...");
      const response = await this.gemini.generate(prompt);

      // 3. Parse JSON response
      let parsed;
      try {
        // Try to extract JSON from the response (it might be wrapped in markdown)
        const jsonMatch =
          response.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.match(/\{[\s\S]*"fileUpdates"[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("[Patch] Failed to parse Gemini response as JSON:", response);
        // Fallback: create a simple structure
        parsed = {
          fileUpdates: [],
          explanation: response,
        };
      }

      console.log(`[Patch] Generated fix for ${parsed.fileUpdates?.length || 0} file(s)`);

      // Generate a diff representation for logging
      const diffString = parsed.fileUpdates
        ?.map(
          (f: any) => `--- ${f.path}\n+++ ${f.path} (fixed)\n${f.content?.substring(0, 200)}...`,
        )
        .join("\n\n");

      console.log(`[Patch] Fix Preview:\n${diffString}`);

      this.status = AgentStatus.COMPLETED;
      return {
        success: true,
        data: {
          diff: diffString,
          files: parsed.fileUpdates?.map((f: any) => f.path) || [],
          fileUpdates: parsed.fileUpdates || [],
          explanation: parsed.explanation,
          summary: parsed.explanation, // Alias for frontend "Patch Strategy" display
        },
      };
    } catch (error: any) {
      console.error("[Patch] Failed:", error);
      this.status = AgentStatus.FAILED;
      return { success: false, error: error.message };
    }
  }
}
