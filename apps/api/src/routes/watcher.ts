import { Router, Request, Response } from "express";
import { ProductionWatcherAgent } from "../agents/watcher.js";
import { GeminiProvider, SecretsManagerService } from "@devops-guardian/shared";
import { MemoryAgent } from "../agents/memory.js";

const router = Router();

// Singleton watcher instance
let watcherAgent: ProductionWatcherAgent | null = null;
const secretsManager = new SecretsManagerService();

// Initialize watcher lazily
function getWatcher(): ProductionWatcherAgent {
  if (!watcherAgent) {
    const gemini = new GeminiProvider(process.env.GEMINI_API_KEY || "");
    const memory = new MemoryAgent(gemini);
    watcherAgent = new ProductionWatcherAgent(gemini, memory);
  }
  return watcherAgent;
}

/**
 * POST /api/watcher/configure
 * Configure the watcher with log source credentials
 * Stores credentials in AWS Secrets Manager for persistence
 */
router.post("/configure", async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      provider,
      awsRegion,
      awsAccessKeyId,
      awsSecretAccessKey,
      logGroupName,
      datadogApiKey,
      datadogAppKey,
      datadogSite,
      projectId, // Optional: identify which project this is for
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "Provider is required (cloudwatch/datadog)" });
    }

    // Prepare credentials payload
    const credentials: Record<string, string> = { provider };

    if (provider === "cloudwatch") {
      if (!awsRegion || !awsAccessKeyId || !awsSecretAccessKey || !logGroupName) {
        return res.status(400).json({
          error: "CloudWatch requires: awsRegion, awsAccessKeyId, awsSecretAccessKey, logGroupName",
        });
      }
      credentials.awsRegion = awsRegion;
      credentials.awsAccessKeyId = awsAccessKeyId;
      credentials.awsSecretAccessKey = awsSecretAccessKey;
      credentials.logGroupName = logGroupName;
    } else if (provider === "datadog") {
      if (!datadogApiKey || !datadogAppKey) {
        return res.status(400).json({ error: "Datadog requires: datadogApiKey, datadogAppKey" });
      }
      credentials.datadogApiKey = datadogApiKey;
      credentials.datadogAppKey = datadogAppKey;
      credentials.datadogSite = datadogSite || "datadoghq.com";
    }

    // Store in AWS Secrets Manager
    const secretName = projectId
      ? `devops-guardian/monitoring/${projectId}`
      : `devops-guardian/monitoring/global`;

    console.log(`[Watcher] Storing credentials in Secrets Manager: ${secretName}`);
    await secretsManager.storeSecrets(secretName, credentials);

    // Configure the watcher in-memory
    const watcher = getWatcher();
    watcher.configure({
      provider,
      awsRegion,
      awsAccessKeyId,
      awsSecretAccessKey,
      logGroupName,
      datadogApiKey,
      datadogAppKey,
      datadogSite,
    });

    return res.json({
      success: true,
      message: `Watcher configured for ${provider} and credentials stored securely.`,
    });
  } catch (error: any) {
    console.error("[Watcher API] Configure error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/watcher/start
 * Start continuous log monitoring
 * Automatically retrieves credentials from Secrets Manager if not configured
 */
router.post("/start", async (req: Request, res: Response): Promise<any> => {
  try {
    const { intervalMs = 60000, projectId } = req.body;
    const watcher = getWatcher();

    // Try to auto-load credentials from Secrets Manager if watcher is not configured
    if (!watcher["config"]) {
      console.log(
        "[Watcher] No config found in memory. Attempting to load from Secrets Manager...",
      );
      try {
        const secretName = projectId
          ? `devops-guardian/monitoring/${projectId}`
          : `devops-guardian/monitoring/global`;

        const credentials = await secretsManager.getSecrets(secretName);

        if (credentials && credentials.provider) {
          console.log(`[Watcher] Loaded credentials from Secrets Manager: ${secretName}`);
          watcher.configure({
            provider: credentials.provider as "cloudwatch" | "datadog",
            awsRegion: credentials.awsRegion,
            awsAccessKeyId: credentials.awsAccessKeyId,
            awsSecretAccessKey: credentials.awsSecretAccessKey,
            logGroupName: credentials.logGroupName,
            datadogApiKey: credentials.datadogApiKey,
            datadogAppKey: credentials.datadogAppKey,
            datadogSite: credentials.datadogSite,
          });
        } else {
          return res.status(400).json({
            error: "Watcher not configured. Please configure via /api/watcher/configure first.",
          });
        }
      } catch (error: any) {
        console.error("[Watcher] Failed to load credentials from Secrets Manager:", error.message);
        return res.status(400).json({
          error: "Watcher not configured and could not load credentials from Secrets Manager.",
        });
      }
    }

    watcher.startWatching(intervalMs);

    return res.json({ success: true, message: `Watcher started (interval: ${intervalMs}ms)` });
  } catch (error: any) {
    console.error("[Watcher API] Start error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/watcher/stop
 * Stop log monitoring
 */
router.post("/stop", async (req: Request, res: Response): Promise<any> => {
  try {
    const watcher = getWatcher();
    watcher.stopWatching();

    return res.json({ success: true, message: "Watcher stopped" });
  } catch (error: any) {
    console.error("[Watcher API] Stop error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/watcher/status
 * Get current watcher status
 */
router.get("/status", async (req: Request, res: Response): Promise<any> => {
  try {
    const watcher = getWatcher();
    return res.json({
      status: watcher.status,
      name: watcher.name,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export { router as watcherRouter };
