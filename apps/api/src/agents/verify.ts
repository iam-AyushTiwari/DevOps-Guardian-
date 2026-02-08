import {
  IAgent,
  AgentStatus,
  AgentResult,
  IncidentEvent,
  VerificationService,
} from "@devops-guardian/shared";
import { MemoryAgent } from "./memory.js";
import { SocketService } from "../services/SocketService.js";

export class VerificationAgent implements IAgent {
  name = "Verification Agent";
  status = AgentStatus.IDLE;
  private memoryAgent?: MemoryAgent;
  private verifier: VerificationService;
  private socketService = SocketService.getInstance();

  constructor(memoryAgent?: MemoryAgent) {
    this.memoryAgent = memoryAgent;
    this.verifier = new VerificationService();
  }

  async execute(
    incident: IncidentEvent,
    patchContext?: any,
    rcaContext?: any,
  ): Promise<AgentResult> {
    this.status = AgentStatus.WORKING;
    console.log(`[Verify] Starting Sandbox verification...`);

    // Stream initial status
    const projectId = (incident.metadata as any)?.projectId || "unknown";
    this.socketService.emitLog(
      projectId,
      "Initializing E2B Sandbox...",
      "INFO",
      "Verify",
      incident.id,
    );

    // Extract metadata
    const metadata = incident.metadata as any;
    const owner = metadata?.owner;
    const repo = metadata?.repo;

    if (!owner || !repo) {
      const errorMsg =
        "[Verify] CRITICAL: Missing owner/repo in metadata. Cannot verify without repository information.";
      console.error(errorMsg);

      this.socketService.emitLog(projectId, errorMsg, "ERROR", "Verify", incident.id);

      this.status = AgentStatus.FAILED;
      return {
        success: false,
        error:
          "Missing required metadata: owner and repo are required for E2B sandbox verification.",
        data: {
          logs: [errorMsg],
          missingFields: ["owner", "repo"],
        },
      };
    }

    const repoUrl = `https://github.com/${owner}/${repo}`;
    const envs = metadata?.envs || {};

    try {
      // Use real E2B Sandbox
      console.log(`[Verify] Running real E2B verification for ${repoUrl}...`);

      const result = await this.verifier.verifyBuild(
        repoUrl,
        envs,
        metadata?.token, // Pass token for private/auth clone
        "main",
        (log: string) => {
          // Real-time log streaming
          this.socketService.emitLog(projectId, log, "INFO", "Verify", incident.id);
        },
      );

      if (!result.success) {
        // ... (rest of the logic)
        // Store negative memory
        if (this.memoryAgent) {
          await this.memoryAgent.storeMemory(
            `Verification failed for ${repoUrl}: ${result.logs.join(", ")}`,
            "NEGATIVE",
            ["verification-failure", owner, repo],
          );
        }

        this.status = AgentStatus.FAILED;
        return {
          success: false,
          error: "Verification failed in E2B sandbox.",
          data: { logs: result.logs },
        };
      }

      console.log(`[Verify] Sandbox verification passed!`);
      this.status = AgentStatus.COMPLETED;
      return {
        success: true,
        data: {
          sandboxId: "e2b-real",
          logs: result.logs.join("\n"),
          results: true, // explicit success flag for UI
        },
      };
    } catch (error: any) {
      console.error(`[Verify] E2B Error:`, error);

      // Store negative memory
      if (this.memoryAgent) {
        await this.memoryAgent.storeMemory(`E2B sandbox crashed: ${error.message}`, "NEGATIVE", [
          "sandbox-error",
        ]);
      }

      this.status = AgentStatus.FAILED;
      return { success: false, error: error.message };
    }
  }
}
