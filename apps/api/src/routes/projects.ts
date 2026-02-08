import { Router, Request, Response } from "express";
import { db } from "@devops-guardian/shared";
import axios from "axios";
import { SecretsManagerService } from "@devops-guardian/shared";

const router = Router();

// GET /api/projects - List all projects
router.get("/", async (req: Request, res: Response): Promise<any> => {
  try {
    const authHeader = req.headers.authorization;
    let userLogin: string | null = null;

    // 1. If Token provided, fetch GitHub User
    if (authHeader) {
      try {
        const userRes = await axios.get("https://api.github.com/user", {
          headers: { Authorization: authHeader },
        });
        userLogin = userRes.data.login;
        console.log(`[Projects] Filtering for GitHub User: ${userLogin}`);
      } catch (e: any) {
        console.warn("[Projects] Failed to validate GitHub token:", e.message);
        return res.status(401).json({ error: "Invalid GitHub Token" });
      }
    }

    // 2. Fetch All Projects
    const projects = await db.project.findMany({
      orderBy: { createdAt: "desc" },
    });

    // 3. Inject Slack Configuration Status & Redact Tokens
    const secretsManager = new SecretsManagerService();
    const projectsWithStatus = await Promise.all(
      projects.map(async (p: any) => {
        const slackConfig = await secretsManager.getSlackConfig(p.id);
        return {
          ...p,
          githubToken: "REDACTED", // Never expose token in list
          slackConfigured: !!(slackConfig.botToken && slackConfig.channelId),
        };
      }),
    );

    return res.json({ projects: projectsWithStatus });
  } catch (error: any) {
    console.error("[Projects] Failed to list projects:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/projects/:id - Get specific project
router.get("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const project = await db.project.findUnique({
      where: { id },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Inject Slack Configuration Status
    const secretsManager = new SecretsManagerService();
    const slackConfig = await secretsManager.getSlackConfig(project.id);

    return res.json({
      project: {
        ...project,
        githubToken: "REDACTED", // Redact token
        slackConfigured: !!(slackConfig.botToken && slackConfig.channelId),
      },
    });
  } catch (error: any) {
    console.error("[Projects] Failed to get project:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/scan - Trigger a Manual Scan
router.post("/:id/scan", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const project = await db.project.findUnique({ where: { id } });

    if (!project) return res.status(404).json({ error: "Project not found" });

    const crypto = await import("crypto");
    const { orchestrator } = await import("../orchestrator");
    const { SocketService } = await import("../services/SocketService");

    console.log(`[Projects] Triggering manual scan for ${project.name}...`);

    const incident = {
      id: crypto.randomUUID(),
      source: "MANUAL" as any,
      severity: "MEDIUM" as const,
      title: `Manual Scan: ${project.name}`,
      description: `User triggered manual scan for ${project.githubRepo}. Checking for common configuration issues.`,
      message: "Manual scan initiated.",
      metadata: {
        projectId: project.id,
        owner: project.githubRepo.split("/")[0],
        repo: project.githubRepo.split("/")[1],
      },
      timestamp: new Date(),
    };

    // Trigger pipeline
    orchestrator.handleIncident(incident as any);

    // Emit update
    SocketService.getInstance().emitIncidentUpdate(incident);

    return res.json({ message: "Scan triggered successfully", incidentId: incident.id });
  } catch (error: any) {
    console.error("[Projects] Scan failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

export const projectsRouter = router;
