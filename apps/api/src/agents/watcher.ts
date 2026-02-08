import {
  IAgent,
  AgentStatus,
  AgentResult,
  IncidentEvent,
  GeminiProvider,
} from "@devops-guardian/shared";
import { LogStreamService, LogStreamConfig, LogEvent } from "@devops-guardian/shared";
import { MemoryAgent } from "./memory.js";
import { orchestrator } from "../orchestrator.js";

export class ProductionWatcherAgent implements IAgent {
  name = "Production Watcher";
  status = AgentStatus.IDLE;
  private gemini: GeminiProvider;
  private memoryAgent?: MemoryAgent;
  private logService?: LogStreamService;
  private config?: LogStreamConfig;
  private pollInterval?: NodeJS.Timeout;

  constructor(gemini: GeminiProvider, memoryAgent?: MemoryAgent) {
    this.gemini = gemini;
    this.memoryAgent = memoryAgent;
  }

  /**
   * Configure and start watching logs
   */
  configure(config: LogStreamConfig) {
    this.config = config;
    this.logService = new LogStreamService(config);
    console.log(`[Watcher] Configured for ${config.provider}`);
  }

  /**
   * Start continuous log monitoring
   */
  startWatching(intervalMs: number = 60000) {
    if (!this.logService) {
      console.error("[Watcher] Not configured. Call configure() first.");
      return;
    }

    this.status = AgentStatus.WORKING;
    console.log(`[Watcher] Starting continuous monitoring (every ${intervalMs / 1000}s)...`);

    // Initial check
    this.checkLogs();

    // Continuous polling
    this.pollInterval = setInterval(() => this.checkLogs(), intervalMs);
  }

  /**
   * Stop watching
   */
  stopWatching() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.status = AgentStatus.IDLE;
    console.log("[Watcher] Stopped monitoring.");
  }

  /**
   * Check logs for anomalies
   */
  private async checkLogs() {
    if (!this.logService) return;

    try {
      console.log("[Watcher] Fetching logs...");
      const logs = await this.logService.getLogs({
        startTime: new Date(Date.now() - 300000), // Last 5 minutes
        limit: 50,
      });

      // Filter for errors/critical
      const errorLogs = logs.filter(
        (l: any) => l.severity === "ERROR" || l.severity === "CRITICAL",
      );

      if (errorLogs.length === 0) {
        console.log("[Watcher] No errors detected. All clear.");
        return;
      }

      console.log(`[Watcher] Found ${errorLogs.length} error(s)! Analyzing...`);

      // Deduplicate similar errors
      const uniqueErrors = this.deduplicateErrors(errorLogs);
      console.log(`[Watcher] ${uniqueErrors.length} unique error pattern(s).`);

      for (const error of uniqueErrors) {
        await this.analyzeAndTrigger(error);
      }
    } catch (err: any) {
      console.error("[Watcher] Log check failed:", err.message);
    }
  }

  /**
   * Analyze error and create incident if needed
   */
  private async analyzeAndTrigger(error: LogEvent) {
    // Check memory to see if we've seen this before recently
    if (this.memoryAgent) {
      const similar = await this.memoryAgent.findSimilar(error.message, 1);
      if (similar.length > 0) {
        console.log(`[Watcher] Similar error found in memory. Skipping duplicate incident.`);
        return;
      }
    }

    // Use Gemini to classify the error
    const prompt = `
You are a production monitoring system. Analyze this error log and determine:
1. Is this a real incident that needs fixing? (true/false)
2. What is the likely root cause?
3. Suggested severity: INFO, WARN, ERROR, CRITICAL

Log:
${error.message}

Respond in JSON:
{"isIncident": true/false, "rootCause": "...", "severity": "..."}
`;

    try {
      const response = await this.gemini.generate(prompt);
      const analysis = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || "{}");

      if (analysis.isIncident) {
        console.log(`[Watcher] Creating incident for: ${error.message.substring(0, 50)}...`);

        const incident: IncidentEvent = {
          id: crypto.randomUUID(),
          source: "PRODUCTION_WATCHER" as any,
          severity: analysis.severity || "ERROR",
          title: `Production Error: ${error.message.substring(0, 100)}`,
          description: error.message,
          message: `Detected by ${error.source}`,
          metadata: {
            logSource: error.source,
            timestamp: error.timestamp,
            aiAnalysis: analysis.rootCause,
          },
          timestamp: new Date(),
        };

        // Store in memory to avoid duplicates
        if (this.memoryAgent) {
          await this.memoryAgent.storeMemory(error.message, "NEGATIVE", [
            "production-error",
            error.source,
          ]);
        }

        // Trigger the healing pipeline
        orchestrator.handleIncident(incident);
      } else {
        console.log(`[Watcher] Not an incident: ${error.message.substring(0, 50)}...`);
      }
    } catch (err: any) {
      console.error("[Watcher] Analysis failed:", err.message);
    }
  }

  /**
   * Deduplicate similar error messages
   */
  private deduplicateErrors(logs: LogEvent[]): LogEvent[] {
    const seen = new Set<string>();
    return logs.filter((log) => {
      // Simple dedup: first 100 chars
      const key = log.message.substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Required by IAgent interface
  async execute(incident: IncidentEvent): Promise<AgentResult> {
    return {
      success: true,
      data: { message: "Watcher is event-driven, use startWatching() instead." },
    };
  }
}
