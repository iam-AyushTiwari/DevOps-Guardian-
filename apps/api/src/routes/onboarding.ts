import { Router, Request, Response } from "express";
import { db, GitHubService, GeminiProvider } from "@devops-guardian/shared";
import { SecretsManagerService } from "@devops-guardian/shared";
import { PipelineAgent } from "../agents/pipeline.js";

const router = Router();

// POST /api/onboarding/repos - List repositories for a token
router.post("/repos", async (req: Request, res: Response): Promise<any> => {
  try {
    const { githubToken } = req.body;
    if (!githubToken) return res.status(400).json({ error: "Missing token" });

    const gh = new GitHubService(githubToken);
    const repos = await gh.getUserRepositories();

    return res.json({ repos });
  } catch (error: any) {
    console.error("[Onboarding] Failed to list repos:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/onboarding/analyze - Check for pipelines
router.post("/analyze", async (req: Request, res: Response): Promise<any> => {
  try {
    const { githubRepo, githubToken } = req.body;
    if (!githubRepo || !githubToken)
      return res.status(400).json({ error: "Missing repo or token" });

    const [owner, repo] = githubRepo.split("/");
    const apiKey = process.env.GEMINI_API_KEY || "";
    const gemini = new GeminiProvider(apiKey);
    const agent = new PipelineAgent(githubToken, gemini);
    const result = await agent.analyze(owner, repo);

    return res.json({ result });
  } catch (error: any) {
    console.error("[Onboarding] Analysis Failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/onboarding/pipeline - Create new pipeline
router.post("/pipeline", async (req: Request, res: Response): Promise<any> => {
  try {
    const { githubRepo, githubToken, type, stack, env } = req.body;
    if (!githubRepo || !githubToken || !type)
      return res.status(400).json({ error: "Missing required fields" });

    const [owner, repo] = githubRepo.split("/");
    const apiKey = process.env.GEMINI_API_KEY || "";
    const gemini = new GeminiProvider(apiKey);
    const agent = new PipelineAgent(githubToken, gemini);

    console.log(`[Onboarding] Generating pipeline for ${githubRepo} (Stack: ${stack || "node"})`);
    const result = await agent.generatePipeline(owner, repo, type, stack || "node", env);

    return res.json({ result });
  } catch (error: any) {
    console.error("[Onboarding] Pipeline Creation Failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/onboarding/connect
router.post("/connect", async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, githubRepo, githubToken } = req.body;

    if (!name || !githubRepo || !githubToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Validate Token with GitHub
    const gh = new GitHubService(githubToken);
    const user = await gh.getAuthenticatedUser();
    console.log(`[Onboarding] Token Validated for User: ${user.login}`);

    // 2. Save Project
    const project = await db.project.create({
      data: {
        name,
        githubRepo, // "facebook/react"
        githubToken: "REDACTED", // Token is now in Secrets Manager
      },
    });

    // 3. Store Token in Secrets Manager
    console.log(`[Onboarding] Attempting to secure GitHub token for project: ${project.id}...`);
    const secretsManager = new SecretsManagerService();
    try {
      await secretsManager.storeGitHubToken(project.id, githubToken);
      console.log(`[Onboarding] GitHub token secured in Secrets Manager ✅`);
    } catch (secError: any) {
      console.error(`[Onboarding] FAILED to store token in Secrets Manager:`, secError.message);
      // We don't throw here to avoid failing the whole project creation,
      // but we log it for debugging.
    }

    console.log(`[Onboarding] Project Created: ${project.id}`);

    return res.json({ success: true, project });
  } catch (error: any) {
    console.error("[Onboarding] Failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

export const onboardingRouter = router;
