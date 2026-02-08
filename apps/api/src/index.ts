import dotenv from "dotenv";
import path from "path";

// robustly load .env from monorepo root
// When running via 'npm run dev --workspace=apps/api', CWD is apps/api
// So we need to go up 2 levels: apps/api -> apps -> root
const envPath = path.resolve(process.cwd(), "../../.env");
dotenv.config({ path: envPath });

console.log(`[API] Loading .env from: ${envPath}`);
console.log(
  "[API] Startup - GEMINI_API_KEY loaded:",
  process.env.GEMINI_API_KEY ? "YES (*******)" : "NO (Using fallback)",
);

import express from "express";

import cors from "cors";
import { orchestrator } from "./orchestrator.js";
import { IncidentEventSchema } from "@devops-guardian/shared";

const app = express();
const port = process.env.PORT || 3001;

app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:3002"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Required for Slack interactions

// Create HTTP server for Socket.io
import { createServer } from "http";
import { SocketService } from "./services/SocketService.js";

const httpServer = createServer(app);
const socketService = SocketService.getInstance();
socketService.initialize(httpServer);

import { onboardingRouter } from "./routes/onboarding.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { watcherRouter } from "./routes/watcher.js";
import { logIngestionRouter } from "./routes/logIngestion.js";
import { slackRouter } from "./routes/slack.js";
import { analyticsRouter } from "./routes/analytics.js";

app.use("/api/onboarding", onboardingRouter);
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/watcher", watcherRouter);
app.use("/api/v1/logs", logIngestionRouter);
app.use("/api/slack", slackRouter);
app.use("/api/analytics", analyticsRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "DevOps Guardian API" });
});

/**
 * GitHub Webhook Endpoint - Real workflow_run failure parsing
 * Configure in GitHub: Settings > Webhooks > Add webhook
 * - Payload URL: https://your-domain/webhook/github
 * - Content type: application/json
 * - Events: Workflow runs
 */
app.post("/webhook/github", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    const payload = req.body;

    console.log(`[Webhook] GitHub Event: ${event}`);

    // Only process failed workflow runs
    if (
      event === "workflow_run" &&
      payload.action === "completed" &&
      payload.workflow_run?.conclusion === "failure"
    ) {
      const run = payload.workflow_run;
      const repo = payload.repository;

      console.log(`[Webhook] Processing failed workflow: ${run.name} in ${repo.full_name}`);

      // Lookup Project to get the Token
      const project = await import("@devops-guardian/shared").then((m) =>
        m.db.project.findFirst({
          where: { githubRepo: repo.full_name },
        }),
      );

      const incident = {
        id: crypto.randomUUID(),
        source: "GITHUB" as const,
        severity: "CRITICAL" as const,
        title: `Build Failed: ${run.name}`,
        description: `Workflow "${run.name}" failed on branch ${run.head_branch}. Commit: ${run.head_sha}`,
        message: `GitHub Actions workflow failed in ${repo.full_name}`,
        metadata: {
          owner: repo.owner.login,
          repo: repo.name,
          workflowName: run.name,
          branch: run.head_branch,
          commitSha: run.head_sha,
          runId: run.id,
          logsUrl: run.logs_url,
          htmlUrl: run.html_url,
          token: project?.githubToken, // Injected from DB
          projectId: project?.id,
          errorSource: "ci-cd",
        },
        timestamp: new Date(),
      };

      // Async processing - don't block webhook response
      orchestrator.handleIncident(incident as any);

      // Emit socket event
      socketService.emitIncidentUpdate(incident);

      res.status(202).json({
        message: "Incident received, agents deployed.",
        incidentId: incident.id,
      });
    } else if (event === "workflow_run") {
      // Success or in-progress, just acknowledge
      res.status(200).json({ message: "Acknowledged (not a failure)" });
    } else {
      // Other events we don't care about
      res.status(200).json({ message: "Event ignored" });
    }
  } catch (error) {
    console.error("GitHub Webhook error:", error);
    res.status(400).json({ error: "Invalid payload" });
  }
});

/**
 * Jenkins Webhook Endpoint - Generic Notification Plugin format
 * Configure in Jenkins: Post-build Actions > HTTP Request
 * - URL: https://your-domain/webhook/jenkins
 * - Method: POST
 * - Body: JSON with build info
 */
app.post("/webhook/jenkins", async (req, res) => {
  try {
    const payload = req.body;

    console.log(`[Webhook] Jenkins Event Received`);

    // Jenkins doesn't have a standard webhook format, so we define our own
    // Expected format:
    // {
    //   "build_status": "FAILURE" | "SUCCESS",
    //   "job_name": "my-pipeline",
    //   "build_number": 42,
    //   "build_url": "http://jenkins/job/my-pipeline/42/",
    //   "git_repo": "owner/repo",
    //   "git_branch": "main",
    //   "git_commit": "abc123",
    //   "console_log": "... build output ..."
    // }

    if (payload.build_status === "FAILURE") {
      const [owner, repo] = (payload.git_repo || "unknown/unknown").split("/");

      console.log(
        `[Webhook] Processing failed Jenkins build: ${payload.job_name} #${payload.build_number}`,
      );

      const incident = {
        id: crypto.randomUUID(),
        source: "JENKINS" as const,
        severity: "CRITICAL" as const,
        title: `Jenkins Build Failed: ${payload.job_name} #${payload.build_number}`,
        description: `Jenkins job "${payload.job_name}" build #${payload.build_number} failed. Branch: ${payload.git_branch}`,
        message: payload.console_log?.substring(0, 2000) || "No logs provided",
        metadata: {
          owner,
          repo,
          jobName: payload.job_name,
          buildNumber: payload.build_number,
          buildUrl: payload.build_url,
          branch: payload.git_branch,
          commitSha: payload.git_commit,
          consoleLog: payload.console_log,
          errorSource: "ci-cd",
        },
        timestamp: new Date(),
      };

      orchestrator.handleIncident(incident as any);

      // Emit socket event
      socketService.emitIncidentUpdate(incident);

      res.status(202).json({
        message: "Jenkins failure received, agents deployed.",
        incidentId: incident.id,
      });
    } else {
      res.status(200).json({ message: "Acknowledged (not a failure)" });
    }
  } catch (error) {
    console.error("Jenkins Webhook error:", error);
    res.status(400).json({ error: "Invalid payload" });
  }
});

/**
 * Push-Based Log Webhook Endpoint
 *
 * Users configure their log systems (CloudWatch Lambda, Datadog, Fluentd, etc.)
 * to POST logs here. NO CREDENTIALS STORED in DevOps Guardian.
 *
 * Expected payload formats:
 *
 * Generic:
 * { "source": "cloudwatch|datadog|custom", "projectId": "...", "logs": ["log line 1", ...] }
 *
 * CloudWatch (via Lambda subscription):
 * { "awslogs": { "data": "base64-encoded-gzip" } }
 *
 * Datadog Webhook:
 * { "alertType": "error", "title": "...", "body": "..." }
 */
app.post("/webhook/logs", async (req, res) => {
  try {
    const payload = req.body;
    console.log(`[Webhook] Received log push`);

    let logs: string[] = [];
    let source = "custom";
    let projectId = payload.projectId || "unknown";

    // Handle CloudWatch Lambda subscription format
    if (payload.awslogs?.data) {
      const zlib = await import("zlib");
      const decoded = Buffer.from(payload.awslogs.data, "base64");
      const unzipped = zlib.gunzipSync(decoded).toString("utf-8");
      const cloudwatchData = JSON.parse(unzipped);
      logs = cloudwatchData.logEvents?.map((e: any) => e.message) || [];
      source = "cloudwatch";
      projectId = cloudwatchData.logGroup || projectId;
      console.log(`[Webhook] CloudWatch: ${logs.length} log events from ${projectId}`);
    }
    // Handle Generic Log Simulation (Raw JSON)
    else if (req.body.log && req.body.source) {
      console.log(`[Webhook] Simulation Event Received for Project: ${req.body.projectId}`);

      // Construct an Incident from the raw log
      const incidentId = crypto.randomUUID();
      const incident = {
        id: incidentId,
        title: "Production Error: " + req.body.log.split("\n")[0].substring(0, 100),
        description: req.body.log,
        severity: "CRITICAL",
        source: req.body.source,
        status: "OPEN",
        metadata: {
          projectId: req.body.projectId,
          raw_log: req.body.log,
          timestamp: req.body.timestamp || new Date().toISOString(),
          errorSource: req.body.environment || "ci-cd",
        },
        timestamp: new Date(),
      };

      console.log("Triggering Orchestrator with Mock Incident...", incidentId);
      orchestrator.handleIncident(incident as any);
      socketService.emitIncidentUpdate(incident as any);
      // Emit the raw log so it shows up in Live Logs immediately
      socketService.emitLog(req.body.projectId, req.body.log);

      return res.status(200).json({ message: "Simulation triggered", incidentId });
    }
    // Handle Datadog webhook format
    else if (payload.alertType || payload.event_type) {
      source = "datadog";
      logs = [payload.body || payload.msg || JSON.stringify(payload)];
      console.log(`[Webhook] Datadog alert: ${payload.title || "Unknown"}`);
    }
    // Handle generic format
    else if (payload.logs && Array.isArray(payload.logs)) {
      source = payload.source || "custom";
      logs = payload.logs;
      console.log(`[Webhook] Generic: ${logs.length} logs from ${source}`);
    }
    // Fallback: treat entire body as single log
    else if (typeof payload === "string" || payload.message) {
      logs = [payload.message || JSON.stringify(payload)];
    }

    if (logs.length === 0) {
      return res.status(200).json({ message: "No logs to process" });
    }

    // Emit live logs to socket
    logs.forEach((log) => socketService.emitLog(projectId, log));

    // Filter for errors
    const errorLogs = logs.filter((log) => {
      const lower = log.toLowerCase();
      return (
        lower.includes("error") ||
        lower.includes("exception") ||
        lower.includes("critical") ||
        lower.includes("fatal") ||
        lower.includes("failed")
      );
    });

    if (errorLogs.length === 0) {
      console.log(`[Webhook] No errors found in ${logs.length} logs. All clear.`);
      return res.status(200).json({ message: "Acknowledged (no errors)" });
    }

    console.log(`[Webhook] Found ${errorLogs.length} error(s)! Creating incident...`);

    // Create incident for each unique error (simplified: take first error)
    const incident = {
      id: crypto.randomUUID(),
      source: source.toUpperCase() as any,
      severity: "CRITICAL" as const,
      title: `Production Error: ${errorLogs[0].substring(0, 100)}`,
      description: errorLogs.join("\n").substring(0, 2000),
      message: `${errorLogs.length} error(s) detected from ${source}`,
      metadata: {
        projectId,
        logSource: source,
        errorCount: errorLogs.length,
        sampleErrors: errorLogs.slice(0, 5),
      },
      timestamp: new Date(),
    };

    // Trigger healing pipeline
    orchestrator.handleIncident(incident as any);

    // Emit socket event
    socketService.emitIncidentUpdate(incident);

    res.status(202).json({
      message: "Errors detected, healing pipeline triggered.",
      incidentId: incident.id,
      errorCount: errorLogs.length,
    });
  } catch (error: any) {
    console.error("Log Webhook error:", error);
    res.status(400).json({ error: error.message });
  }
});

// New Endpoint: Get active or history incidents
app.get("/incidents", async (req, res) => {
  const { projectId, status } = req.query;

  try {
    // Disable caching to prevent 304 issues with history updates
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // If status is specific (e.g. RESOLVED), fetch from DB (History)
    if (status === "RESOLVED") {
      const incidents = await import("@devops-guardian/shared").then((m) =>
        m.db.incident.findMany({
          where: {
            status: "RESOLVED",
          },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            agentRuns: {
              orderBy: { startedAt: "asc" },
            },
          },
        }),
      );

      // Manual filter in JS to be safe with JSONB on SQLite/different DBs
      const filtered = projectId
        ? incidents.filter((i: any) => {
            const meta = i.metadata as any;
            return meta?.projectId === projectId || meta?.owner + "/" + meta?.repo === projectId;
          })
        : incidents;

      // Map Prisma fields to Frontend Interface
      const mapped = filtered.map((i: any) => ({
        ...i,
        timestamp: i.createdAt, // Frontend expects 'timestamp'
        statusMessage: (i.metadata as any)?.statusMessage || "Resolution verified", // Fallback for resolved items
        prUrl: (i.metadata as any)?.prUrl,
        agentRuns: i.agentRuns, // Ensure agent runs are passed
      }));

      return res.json({ incidents: mapped });
    }

    // Default: Active incidents from Orchestrator memory (fast)
    let incidents = orchestrator.getActiveIncidents();

    if (projectId) {
      incidents = incidents.filter((i) => {
        const meta = i.metadata as any;
        return (
          meta?.projectId === projectId || i.metadata?.owner + "/" + i.metadata?.repo === projectId
        );
      });
    }

    res.json({ incidents });
  } catch (error: any) {
    console.error("Failed to fetch incidents DETAILED:", JSON.stringify(error, null, 2));
    console.error(error.stack);
    res.status(500).json({ error: "Failed to fetch incidents", details: error.message });
  }
});

httpServer.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
