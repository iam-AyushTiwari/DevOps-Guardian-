import { Router, Request, Response, NextFunction } from "express";
import { orchestrator } from "../orchestrator.js";
import { db } from "@devops-guardian/shared";
import zlib from "zlib";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter: max 100 requests per minute per project
const logRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: (req) => req.params.projectId || "unknown",
  message: { error: "Too many log ingestion requests. Max 100/min per project." },
});

/**
 * Generate or retrieve webhook token for a project from database
 */
async function getOrCreateProjectToken(projectId: string): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { webhookToken: true },
  });

  if (project?.webhookToken) {
    return project.webhookToken;
  }

  // Generate new token
  const token = `gdn_${crypto.randomBytes(32).toString("hex")}`;
  await db.project.update({
    where: { id: projectId },
    data: { webhookToken: token },
  });

  return token;
}

/**
 * Middleware: Decompress gzip (AWS Firehose sends gzipped data)
 */
function decompressGzip(req: Request, res: Response, next: NextFunction) {
  const contentEncoding = req.headers["content-encoding"];

  if (contentEncoding === "gzip") {
    let chunks: Buffer[] = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      zlib.gunzip(buffer, (err, decompressed) => {
        if (err) {
          console.error("[Logs] Gzip decompression failed:", err);
          return res.status(400).json({ error: "Invalid gzip data" });
        }
        try {
          req.body = JSON.parse(decompressed.toString("utf-8"));
          next();
        } catch (parseErr) {
          console.error("[Logs] JSON parse failed:", parseErr);
          return res.status(400).json({ error: "Invalid JSON after decompression" });
        }
      });
    });
  } else {
    next();
  }
}

/**
 * Middleware: Verify project token from database
 */
async function verifyToken(req: Request, res: Response, next: NextFunction) {
  const projectId = req.params.projectId;
  const authHeader = req.headers.authorization || req.headers["x-guardian-token"];

  // SKIP AUTH FOR DEMO/DEV if explicitly requested or if header missing in dev
  if (!authHeader && process.env.NODE_ENV !== "production") {
    console.warn(
      `[LogIngestion] WARN: Missing token for project ${projectId}. Allowing in DEV mode.`,
    );
    return next();
  }

  if (!authHeader) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  const token = authHeader.toString().replace("Bearer ", "");

  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { webhookToken: true },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.webhookToken && token !== project.webhookToken) {
      return res.status(403).json({ error: "Invalid token for this project" });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: "Token verification failed" });
  }
}

/**
 * Enhanced error pattern detection
 */
function detectErrors(logRecords: any[]): any[] {
  const errorPatterns = [
    /error/i,
    /exception/i,
    /critical/i,
    /fatal/i,
    /status.?(500|502|503|504)/i,
    /timeout/i,
    /failed/i,
    /crash/i,
    /segfault/i,
    /out of memory/i,
    /econnrefused/i,
    /eaddrinuse/i,
  ];

  return logRecords.filter((log) => {
    const message = typeof log === "string" ? log : log.message || JSON.stringify(log);
    return errorPatterns.some((pattern) => pattern.test(message));
  });
}

/**
 * POST /api/v1/logs/:projectId
 * Receives logs from AWS Firehose, Datadog, or any webhook
 */
router.post(
  "/:projectId",
  logRateLimiter,
  decompressGzip,
  verifyToken,
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { projectId } = req.params;
      const payload = req.body;

      console.log(`[LogIngestion] Received logs for project: ${projectId}`);

      let logRecords: any[] = [];

      // AWS Firehose format
      if (payload.records) {
        logRecords = payload.records.map((r: any) => {
          const decoded = Buffer.from(r.data, "base64").toString("utf-8");
          try {
            return JSON.parse(decoded);
          } catch {
            return { message: decoded };
          }
        });
      }
      // Datadog format
      else if (payload.logs) {
        logRecords = payload.logs;
      }
      // Generic array
      else if (Array.isArray(payload)) {
        logRecords = payload;
      }
      // Single log object
      else {
        logRecords = [payload];
      }

      const project = await db.project.findUnique({
        where: { id: projectId },
      });

      const errorLogs = detectErrors(logRecords);

      if (errorLogs.length === 0) {
        return res.status(200).json({
          message: "Logs received and analyzed. No errors detected.",
          recordsProcessed: logRecords.length,
        });
      }

      const firstError = errorLogs[0];
      const errorMessage = firstError.message || JSON.stringify(firstError);

      // 1. Generate Fingerprint (More aggressive deduplication)
      let normalizedMessage = errorMessage.toLowerCase().trim();
      normalizedMessage = normalizedMessage.replace(
        /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?/g,
        "",
      );
      normalizedMessage = normalizedMessage.replace(/\d{2}:\d{2}:\d{2}/g, "");
      normalizedMessage = normalizedMessage.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        "",
      );
      normalizedMessage = normalizedMessage.substring(0, 300);

      const fingerprint = crypto
        .createHash("md5")
        .update(normalizedMessage + projectId)
        .digest("hex");

      // 2. Check for OPEN duplicate
      const duplicate = await db.incident.findFirst({
        where: {
          fingerprint,
          status: {
            not: "RESOLVED",
          },
        },
      });

      if (duplicate) {
        await db.incident.update({
          where: { id: duplicate.id },
          data: {
            occurrenceCount: { increment: 1 },
            lastSeen: new Date(),
          },
        });

        return res.status(200).json({
          message: "Duplicate incident detected. Count updated.",
          incidentId: duplicate.id,
          duplicate: true,
        });
      }

      // 3. Extract Rich Metadata
      const metadata = extractMetadata(payload, firstError, projectId, project);

      // 4. Create New Incident
      const incident = {
        id: crypto.randomUUID(),
        source: "LOG_INGESTION" as any,
        severity: "CRITICAL" as const,
        title: `Production Error: ${errorMessage.substring(0, 100) || "Log error detected"}`,
        description: errorLogs
          .map((e) => e.message || JSON.stringify(e))
          .join("\n")
          .substring(0, 2000),
        status: "OPEN",
        fingerprint,
        occurrenceCount: 1,
        lastSeen: new Date(),
        message: `${errorLogs.length} error(s) detected from logs`,
        metadata,
        timestamp: new Date(),
      };

      // Trigger RCA Pipeline
      orchestrator.handleIncident(incident as any);

      return res.status(202).json({
        message: "Errors detected. Healing pipeline triggered.",
        incidentId: incident.id,
        errorCount: errorLogs.length,
        recordsProcessed: logRecords.length,
        duplicate: false,
      });
    } catch (error: any) {
      console.error("[LogIngestion] Processing failed:", error);
      return res.status(500).json({ error: error.message });
    }
  },
);

/**
 * Helper: Extract structured metadata from different log providers
 */
function extractMetadata(payload: any, errorLog: any, projectId: string, project?: any) {
  const [owner, repo] = project?.githubRepo?.split("/") || ["unknown", "unknown"];

  const base = {
    projectId,
    owner,
    repo,
    token: "REDACTED",
    logSource: "webhook",
    timestamp: new Date().toISOString(),
    errorSource: "production",
    service: "unknown-service",
    region: "unknown-region",
    validationTags: [] as string[],
    rawLog: errorLog,
    images: payload.metadata?.images || [],
  };

  try {
    if (payload.logGroup || payload.logStream) {
      base.logSource = "aws-cloudwatch";
      base.service = payload.logGroup?.split("/").pop() || payload.logGroup || "aws-service";
      base.region = payload.region || "us-east-1";
      base.errorSource = "production";
      if (payload.logStream) base.validationTags.push(`stream:${payload.logStream}`);
    } else if (payload.ddsource || payload.service) {
      base.logSource = "datadog";
      base.service = payload.service || errorLog.service || "datadog-service";
      // Explicitly check for environment (CI/CD) or ddsource, otherwise production
      base.errorSource = payload.environment || payload.ddsource || "production";
      if (payload.hostname) base.validationTags.push(`host:${payload.hostname}`);
      if (payload.tags) base.validationTags.push(...payload.tags.split(","));
    } else {
      base.service = errorLog.service || errorLog.component || "backend-api";
      base.errorSource = payload.environment || errorLog.environment || "production";
    }
  } catch (e) {
    console.warn("[LogIngestion] Failed to extract rich metadata:", e);
  }

  return base;
}

/**
 * GET /api/v1/logs/:projectId/token
 * Get or create webhook token for a project
 */
router.get("/:projectId/token", async (req: Request, res: Response): Promise<any> => {
  try {
    const { projectId } = req.params;
    const token = await getOrCreateProjectToken(projectId);

    return res.json({
      projectId,
      token,
      webhookUrl: `${req.protocol}://${req.get("host")}/api/v1/logs/${projectId}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export { router as logIngestionRouter };
