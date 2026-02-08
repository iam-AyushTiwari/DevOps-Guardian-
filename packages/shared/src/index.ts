import { z } from "zod";

// --- Domain Models ---

export const IncidentEventSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["GITHUB", "JENKINS", "SENTRY", "DATADOG", "CLOUDWATCH", "PRODUCTION_WATCHER"]),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  message: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  metadata: z.any().optional(),
  timestamp: z.coerce.date(),
});

export type IncidentEvent = z.infer<typeof IncidentEventSchema>;

export enum AgentStatus {
  IDLE = "IDLE",
  WORKING = "WORKING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export type AgentResult = {
  success: boolean;
  data?: any;
  error?: string;
  artifacts?: {
    type: "plan" | "diff" | "logs";
    content: string;
  }[];
};

// --- Agent Interface ---

export interface IAgent {
  name: string;
  status: AgentStatus;

  /**
   * Main execution method.
   * @param input The input context (Incident, previous agent outputs, etc.)
   */
  /**
   * Main execution method.
   * @param input The input context (Incident, previous agent outputs, etc.)
   */
  execute(input: any): Promise<AgentResult>;
}

export * from "./db.js";
export * from "./services/GeminiProvider.js";
export * from "./services/GitHubService.js";
export * from "./services/SecretsManagerService.js";
export * from "./services/VerificationService.js";
export * from "./services/LogStreamService.js";
export * from "./services/SlackService.js";
