import { IncidentEvent, AgentStatus, AgentResult, db } from "@devops-guardian/shared";
import { RCAAgent } from "./agents/rca";
import { PatchAgent } from "./agents/patch";
import { VerificationAgent } from "./agents/verify";
import { PRAgent } from "./agents/pr";
import { GeminiProvider } from "@devops-guardian/shared";
import { MemoryAgent } from "./agents/memory";
import { SlackService } from "@devops-guardian/shared/src/services/SlackService";
import { SecretsManagerService } from "@devops-guardian/shared/src/services/SecretsManagerService";
import { SocketService } from "./services/SocketService";
import dotenv from "dotenv";

dotenv.config();

export class AgentOrchestrator {
  // Hybrid Storage: Map (Memory) + DB (Persistence)
  private activeIncidents: Map<string, IncidentEvent> = new Map();

  // Shared Services
  private geminiProvider = new GeminiProvider(process.env.GEMINI_API_KEY || "");
  private memoryAgent = new MemoryAgent(this.geminiProvider);
  private secretsManager = new SecretsManagerService();
  private socketService = SocketService.getInstance();

  // Agents
  private rcaAgent = new RCAAgent(process.env.GEMINI_API_KEY || "", this.memoryAgent);
  private patchAgent = new PatchAgent();
  private verificationAgent = new VerificationAgent(this.memoryAgent);
  private prAgent = new PRAgent();

  constructor() {
    // Hydrate from DB on startup (optional, best effort)
    this.hydrateFromDb();
  }

  /**
   * Dynamically load Slack Service for a project
   */
  private async getSlackService(projectId: string): Promise<SlackService | null> {
    try {
      // 1. Try fetching from Secrets Manager
      const secrets = await this.secretsManager.getSlackConfig(projectId);
      if (secrets.botToken && secrets.channelId) {
        return new SlackService(secrets.botToken, secrets.channelId);
      }

      // 2. Fallback to global env (for backward compatibility/dev)
      if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
        return new SlackService(process.env.SLACK_BOT_TOKEN, process.env.SLACK_CHANNEL_ID);
      }
    } catch (error) {
      console.warn(`[Orchestrator] Failed to load Slack config for ${projectId}`, error);
    }
    return null;
  }

  // Best-effort hydration
  private async hydrateFromDb() {
    try {
      const stored = await db.incident.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
      });
      stored.forEach(
        (i: {
          id: string;
          title: any;
          source: any;
          severity: any;
          description: any;
          createdAt: any;
        }) => {
          this.activeIncidents.set(i.id, {
            id: i.id,
            title: i.title,
            source: i.source as any,
            severity: i.severity as any,
            message: i.description,
            timestamp: i.createdAt,
          });
        },
      );
    } catch (e) {
      console.warn("DB Hydration failed (ignoring):", e);
    }
  }

  public getActiveIncidents() {
    // Return from Memory (Fast & Reliable)
    return Array.from(this.activeIncidents.values());
  }

  /**
   * Main entry point: Ingests a new incident and starts the workflow.
   */
  public async handleIncident(incident: IncidentEvent) {
    console.log(`[Orchestrator] Received incident: ${incident.title} (${incident.id})`);

    // 0. Save to Memory
    this.activeIncidents.set(incident.id, incident);

    // Broadcast creation
    this.socketService.emitIncidentUpdate(incident);

    // 1. Save Incident to DB
    try {
      await db.incident.create({
        data: {
          id: incident.id,
          title: incident.title || "Unknown Incident",
          description: incident.description || incident.message,
          source: incident.source,
          severity: incident.severity,
          status: "OPEN",
          fingerprint: (incident as any).fingerprint,
          occurrenceCount: (incident as any).occurrenceCount || 1,
          lastSeen: (incident as any).lastSeen || new Date(),
          metadata: incident as any,
        },
      });
    } catch (err) {
      console.error("[Orchestrator] Failed to persist incident:", err);
    }

    try {
      await this.runWorkflow(incident);
    } catch (error) {
      console.error(`[Orchestrator] Workflow failed for ${incident.id}:`, error);
    }
  }

  /**
   * The "Brain" of the operation.
   * Decides which agents to call and in what order.
   */
  private async runWorkflow(incident: IncidentEvent) {
    console.log("[Orchestrator] Starting Workflow: Monitor -> RCA -> Patch -> Verify");

    // Update Status
    incident.status = "RCA_IN_PROGRESS"; // Use string for UI simplicity
    this.socketService.emitIncidentUpdate({
      ...incident,
      statusMessage: "Analyzing Root Cause...",
    });

    // Step 1: RCA
    await this.logAgentRun(incident.id, "RCA", AgentStatus.WORKING, "Starting analysis...");
    const rcaResult = await this.rcaAgent.execute(incident);
    await this.logAgentRun(
      incident.id,
      "RCA",
      rcaResult.success ? AgentStatus.COMPLETED : AgentStatus.FAILED,
      JSON.stringify(rcaResult),
    );

    if (!rcaResult.success) {
      console.warn("[Orchestrator] RCA failed (expected in scaffold). Proceeding to Patch Demo...");
    } else {
      incident.metadata = { ...incident.metadata, rcaData: rcaResult.data };
      this.socketService.emitIncidentUpdate({ ...incident, statusMessage: "RCA Complete" });
    }

    // Step 2: Patch
    console.log("[2/4] Patch Agent starting...");
    incident.status = "PATCH_IN_PROGRESS";
    this.socketService.emitIncidentUpdate({ ...incident, statusMessage: "Generating Code Fix..." });

    await this.logAgentRun(incident.id, "Patch", AgentStatus.WORKING, "Generating fix...");
    const patchResult = await this.patchAgent.execute(incident, rcaResult.data);
    await this.logAgentRun(
      incident.id,
      "Patch",
      patchResult.success ? AgentStatus.COMPLETED : AgentStatus.FAILED,
      JSON.stringify(patchResult),
    );

    if (!patchResult.success) {
      console.error("[Orchestrator] Patch Failed. Stopping.");
      return;
    }

    incident.metadata = { ...incident.metadata, patchData: patchResult.data };
    this.socketService.emitIncidentUpdate({ ...incident, statusMessage: "Patch Generated" });

    // Determine workflow based on error source
    const metadata = incident.metadata as any;
    const errorSource = metadata?.errorSource || "production"; // Default to safer option

    if (errorSource === "ci-cd") {
      // CI/CD: Auto-fix workflow (no approval needed)
      console.log("[Orchestrator] CI/CD error detected - auto-fixing...");
      await this.runAutoFixWorkflow(incident, rcaResult.data, patchResult.data);
      return;
    }

    if (errorSource === "production") {
      // Production: Request approval before proceeding
      console.log("[Orchestrator] Production error detected - requesting approval...");
      await this.requestApproval(incident, rcaResult.data, patchResult.data);
      return;
    }
  }

  private async logAgentRun(incidentId: string, name: string, status: AgentStatus, log: string) {
    try {
      await db.agentRun.create({
        data: {
          incidentId,
          agentName: name,
          status,
          thoughts: log,
        },
      });
    } catch (e) {
      console.error("Failed to log agent run", e);
    }
  }

  /**
   * CI/CD Auto-Fix Workflow: Verify -> PR -> Slack Notification
   */
  private async runAutoFixWorkflow(incident: IncidentEvent, rcaData: any, patchData: any) {
    // Step 3: Verify
    console.log("[3/4] Verification Agent starting...");
    incident.status = "VERIFY_IN_PROGRESS";
    this.socketService.emitIncidentUpdate({
      ...incident,
      statusMessage: "Verifying Fix in Sandbox...",
    });

    await this.logAgentRun(incident.id, "Verify", AgentStatus.WORKING, "Verifying fix...");
    const verifyResult = await this.verificationAgent.execute(incident, patchData);
    await this.logAgentRun(
      incident.id,
      "Verify",
      verifyResult.success ? AgentStatus.COMPLETED : AgentStatus.FAILED,
      JSON.stringify(verifyResult),
    );

    if (!verifyResult.success) {
      console.error("[Orchestrator] Verification failed. Stopping auto-fix.");
      this.socketService.emitIncidentUpdate({
        ...incident,
        status: "FAILED",
        statusMessage: "Verification Failed",
      });
      return;
    }

    // Step 4: Create PR and notify
    await this.createPRAndNotify(incident, patchData, rcaData, "ci-cd");
  }

  /**
   * Production Approval Workflow: Send Slack notification -> Wait for approval
   */
  private async requestApproval(incident: IncidentEvent, rcaData: any, patchData: any) {
    incident.status = "AWAITING_APPROVAL";
    this.socketService.emitIncidentUpdate({
      ...incident,
      statusMessage: "Waiting for Approval (Slack)...",
    });

    const projectId = (incident.metadata as any)?.projectId;
    const slackService = await this.getSlackService(projectId);

    if (!slackService) {
      console.warn("[Orchestrator] Slack not configured. Proceeding with auto-fix.");
      await this.runAutoFixWorkflow(incident, rcaData, patchData);
      return;
    }

    // Send approval request to Slack
    await slackService.sendIncidentNotification({
      id: incident.id,
      title: incident.title,
      rcaAnalysis: rcaData?.analysis || "RCA analysis pending",
      patchSummary: patchData?.summary || patchData?.diff?.substring(0, 300) || "Patch generated",
    });

    console.log(`[Orchestrator] Approval request sent to Slack for incident: ${incident.id}`);

    // Store incident data for when user approves
    await db.incident.update({
      where: { id: incident.id },
      data: {
        metadata: {
          ...(incident.metadata as any),
          rcaData,
          patchData,
          awaitingApproval: true,
        },
      },
    });
  }

  /**
   * Verified in Sandbox (Triggered by Slack)
   */
  async handleVerificationRequest(incidentId: string, channelId: string, threadTs: string) {
    console.log(`[Orchestrator] Manual verification requested for: ${incidentId}`);

    let slackService: SlackService | null = null;

    try {
      const incident = await db.incident.findUnique({ where: { id: incidentId } });
      if (!incident) {
        throw new Error("Incident not found");
      }

      this.socketService.emitIncidentUpdate({
        ...incident,
        statusMessage: "Manual Verification Requested...",
      });

      const projectId = (incident.metadata as any)?.projectId || "";
      slackService = await this.getSlackService(projectId);

      if (slackService) {
        await slackService.replyToThread(
          channelId,
          threadTs,
          "🧪 Starting E2B Sandbox Verification... (This may take a minute)",
        );
      }

      const metadata = incident.metadata as any;
      const { patchData } = metadata;

      if (!patchData) {
        throw new Error("No patch data found to verify");
      }

      // Run Verification
      const verifyResult = await this.verificationAgent.execute(incident as any, patchData);

      const logOutput = verifyResult.success
        ? "✅ Verification Passed! Tests are green."
        : `❌ Verification Failed.\n\nLogs:\n${JSON.stringify(verifyResult.data?.error || "Unknown error", null, 2)}`;

      // Reply to thread with results
      if (slackService) {
        await slackService.replyToThread(channelId, threadTs, logOutput);
      }
    } catch (error: any) {
      console.error("[Orchestrator] Verification failed:", error);
      if (slackService) {
        await slackService.replyToThread(
          channelId,
          threadTs,
          `⚠️ Verification process error: ${error.message}`,
        );
      }
    }
  }

  /**
   * Called when user approves in Slack
   */
  async handleApproval(incidentId: string) {
    try {
      const incident = await db.incident.findUnique({ where: { id: incidentId } });
      if (!incident) {
        console.error(`[Orchestrator] Incident not found: ${incidentId}`);
        return;
      }

      const metadata = incident.metadata as any;
      const { rcaData, patchData } = metadata;

      console.log(`[Orchestrator] Approval received for: ${incidentId}`);

      this.socketService.emitIncidentUpdate({
        ...incident,
        statusMessage: "Approval Received. Resuming...",
      });

      // Continue with verification and PR creation
      await this.createPRAndNotify(incident as any, patchData, rcaData, "production");
    } catch (error) {
      console.error("[Orchestrator] Approval handling failed:", error);
    }
  }

  /**
   * Called when user REJECTS in Slack
   */
  async handleRejection(incidentId: string) {
    try {
      const incident = await db.incident.findUnique({ where: { id: incidentId } });
      if (!incident) {
        console.error(`[Orchestrator] Incident not found for rejection: ${incidentId}`);
        return;
      }

      console.log(`[Orchestrator] Rejection received for: ${incidentId}`);

      // Update in DB
      await db.incident.update({
        where: { id: incidentId },
        data: {
          status: "RESOLVED", // or CANCELLED if we prefer
          metadata: {
            ...(incident.metadata as any),
            rejectedBy: "user",
            rejectionReason: "Slack Interaction",
          },
        },
      });

      // Emit socket update
      this.socketService.emitIncidentUpdate({
        ...incident,
        status: "RESOLVED",
        statusMessage: "Fix Rejected by User (Won't Fix)",
      });

      // Update memory state
      if (this.activeIncidents.has(incidentId)) {
        const cached = this.activeIncidents.get(incidentId);
        if (cached) {
          cached.status = "RESOLVED";
          this.activeIncidents.set(incidentId, cached);
        }
      }
    } catch (error) {
      console.error("[Orchestrator] Rejection handling failed:", error);
    }
  }

  /**
   *  Shared PR creation and notification logic
   */
  private async createPRAndNotify(
    incident: IncidentEvent,
    patchData: any,
    rcaData: any,
    source: string,
  ) {
    //Step 3: Verify (for production flow)
    if (source === "production") {
      console.log("[3/4] Verification Agent starting...");
      incident.status = "VERIFY_IN_PROGRESS";
      this.socketService.emitIncidentUpdate({
        ...incident,
        statusMessage: "Verifying Fix in Sandbox...",
      });

      await this.logAgentRun(incident.id, "Verify", AgentStatus.WORKING, "Verifying fix...");
      const verifyResult = await this.verificationAgent.execute(incident, patchData);
      await this.logAgentRun(
        incident.id,
        "Verify",
        verifyResult.success ? AgentStatus.COMPLETED : AgentStatus.FAILED,
        JSON.stringify(verifyResult),
      );

      if (!verifyResult.success) {
        console.error("[Orchestrator] Verification failed.");
        this.socketService.emitIncidentUpdate({
          ...incident,
          status: "FAILED",
          statusMessage: "Verification Failed",
        });
        return;
      }
    }

    // Step 4: PR Creation
    console.log('[4/4] PR Agent: "Creating Pull Request..."');
    incident.status = "PR_CREATION_IN_PROGRESS";
    this.socketService.emitIncidentUpdate({
      ...incident,
      statusMessage: "Creating Pull Request...",
    });

    const metadata = incident.metadata as any;
    const owner = metadata?.owner;
    const repo = metadata?.repo;

    if (!owner || !repo) {
      console.warn("[Orchestrator] Skipped PR: Missing owner/repo.");
      return;
    }

    await this.logAgentRun(incident.id, "PR", AgentStatus.WORKING, "Creating PR...");
    const prResult = await this.prAgent.execute(
      incident,
      { owner, repo, fileUpdates: patchData.fileUpdates },
      metadata?.token,
    );

    await this.logAgentRun(
      incident.id,
      "PR",
      prResult.success ? AgentStatus.COMPLETED : AgentStatus.FAILED,
      JSON.stringify(prResult),
    );

    if (!prResult.success) {
      console.error("[Orchestrator] PR creation failed.");
      this.socketService.emitIncidentUpdate({
        ...incident,
        status: "FAILED",
        statusMessage: "PR Creation Failed",
      });
      return;
    }

    const prUrl = prResult.data.prUrl;
    console.log(`[Orchestrator] PR created: ${prUrl}`);

    incident.status = "RESOLVED";
    this.socketService.emitIncidentUpdate({
      ...incident,
      status: "RESOLVED",
      statusMessage: "PR Created!",
      prUrl,
    });

    // Send Slack notification based on source
    const projectId = (incident.metadata as any)?.projectId || "";
    const slackService = await this.getSlackService(projectId);

    if (slackService) {
      if (source === "ci-cd") {
        await slackService.sendAutoFixCompletedNotification({
          title: incident.title,
          rcaAnalysis: rcaData?.analysis || "Auto-fix completed",
          filesChanged: patchData?.fileUpdates?.map((f: any) => f.path) || [],
          prUrl,
        });
      } else {
        await slackService.sendPRCreatedNotification(prUrl, incident.title);
      }
    }
  }
}

export const orchestrator = new AgentOrchestrator();
