import { IAgent, AgentStatus, AgentResult, IncidentEvent } from "@devops-guardian/shared";
import {
  GitHubService,
  SecretsManagerService,
  VerificationService,
  GeminiProvider,
} from "@devops-guardian/shared";

export class PipelineAgent implements IAgent {
  name = "Pipeline Agent";
  status = AgentStatus.IDLE;
  private github: GitHubService;
  private secretsHelper: SecretsManagerService;
  private verifier: VerificationService;
  private gemini: GeminiProvider;
  private token: string;

  constructor(token: string, gemini: GeminiProvider) {
    this.token = token;
    this.github = new GitHubService(token);
    this.secretsHelper = new SecretsManagerService();
    this.verifier = new VerificationService();
    this.gemini = gemini;
  }

  async execute(incident: IncidentEvent): Promise<AgentResult> {
    throw new Error("Pipeline Agent is designed for direct calls, not event loop yet.");
  }

  async analyze(owner: string, repo: string) {
    this.status = AgentStatus.WORKING;
    console.log(`[Pipeline] Analyzing ${owner}/${repo}...`);

    try {
      // 1. Check for Existing Pipelines
      const rootFiles = await this.github.getRepoStructure(owner, repo, "");
      const fileNames = rootFiles.map((f: any) => f.name);

      if (fileNames.includes("Jenkinsfile")) {
        return { status: "EXISTS", type: "Jenkins", file: "Jenkinsfile" };
      }
      if (fileNames.includes("gitlab-ci.yml")) {
        return { status: "EXISTS", type: "GitLab", file: "gitlab-ci.yml" };
      }
      if (fileNames.includes("azure-pipelines.yml")) {
        return { status: "EXISTS", type: "Azure", file: "azure-pipelines.yml" };
      }

      // Check deep for GitHub Actions
      const workflows = await this.github.getRepoStructure(owner, repo, ".github/workflows");
      if (workflows.length > 0) {
        return {
          status: "EXISTS",
          type: "GitHub Actions",
          file: workflows[0].name,
        };
      }

      // 2. No Pipeline Found -> Detect Stack
      let stack = "unknown";
      if (fileNames.includes("package.json")) stack = "node";
      else if (fileNames.includes("requirements.txt") || fileNames.includes("pyproject.toml"))
        stack = "python";
      else if (fileNames.includes("go.mod")) stack = "go";
      else if (fileNames.includes("pom.xml")) stack = "java";

      return { status: "MISSING", suggestedStack: stack };
    } catch (error) {
      console.warn("[Pipeline] Analysis Partial/Failed:", error);
      return { status: "MISSING", suggestedStack: "unknown" };
    } finally {
      this.status = AgentStatus.IDLE;
    }
  }

  private async generateAIContent(
    type: string,
    stack: string,
    envs?: Record<string, string>,
  ): Promise<string> {
    const envString = envs
      ? Object.keys(envs)
          .map((k) => `${k}: \${{ secrets.${k} }}`)
          .join("\n")
      : "";

    const prompt = `Act as a Senior DevOps Engineer. Generate a production-ready ${type} configuration for a ${stack} project.
    
    Follow an Enterprise CI structure with these mandatory stages:
    1. **Quality & Security**: Run linting (e.g., eslint), formatting, and a security audit (e.g., npm audit).
    2. **Test**: Run unit tests and integration tests.
    3. **Build**: Compile the project and upload artifacts (e.g., dist/ or build/ folder).
    
    Requirements:
    - Use caching for dependencies where possible to optimize speed.
    - If ${type} is "github-actions", use individual jobs with 'needs' to enforce ordering.
    - If ${type} is "jenkins", use Declarative Pipeline syntax with 'stages'.
    - Inject these environment variables if applicable:
    ${envString}
    
    Return ONLY the raw file content (YAML or Groovy) without markdown blocks (no \`\`\`) or explanations.`;

    console.log(`[Pipeline] Asking Gemini to generate Enterprise ${type} for ${stack}...`);
    const content = await this.gemini.generate(prompt);

    return content.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  }

  async generatePipeline(
    owner: string,
    repo: string,
    type: string,
    stack: string = "node",
    envs?: Record<string, string>,
  ) {
    this.status = AgentStatus.WORKING;
    console.log(`[Pipeline] Generating ${type} pipeline for ${owner}/${repo} (Stack: ${stack})...`);

    try {
      if (envs && Object.keys(envs).length > 0) {
        await this.secretsHelper.storeEnvVars(owner, repo, envs);
      }

      let path = "";
      let message = "";

      if (type === "github-actions") {
        path = ".github/workflows/devops-guardian.yml";
        message = "ci: add enterprise-grade devops guardian pipeline";
      } else if (type === "jenkins") {
        path = "Jenkinsfile";
        message = "ci: add enterprise-grade jenkinsfile";
      } else {
        throw new Error(`Unsupported pipeline type: ${type}`);
      }

      const content = await this.generateAIContent(type, stack, envs);

      let verificationPassed = false;
      let verificationLogs: string[] = [];
      const e2bKey = process.env.E2B_API_KEY;

      if (e2bKey) {
        console.log("[Pipeline] Starting E2B Verification...");
        const repoUrl = `https://github.com/${owner}/${repo}.git`;
        const result = await this.verifier.verifyBuild(repoUrl, envs || {}, this.token);
        verificationLogs = result.logs;

        if (!result.success) {
          throw new Error("Verification Failed. Logs: " + result.logs.join("\n"));
        }
        verificationPassed = true;
      }

      const branchName = `ci/devops-guardian-${Date.now()}`;
      await this.github.createBranch(owner, repo, "main", branchName);
      await this.github.commitFile(owner, repo, path, content, message, branchName);

      const pr = await this.github.createPullRequest(
        owner,
        repo,
        "Add Enterprise-Grade CI/CD Pipeline",
        `Adds a dynamically generated **${type}** pipeline for **${stack}**.\n\n` +
          `**Verification Status**: ${verificationPassed ? "✅ Verified" : "⚠️ Skipped"}\n\n` +
          `Logs:\n\`\`\`\n${verificationLogs.join("\n")}\n\`\`\``,
        branchName,
        "main",
      );

      return { success: true, path, type, prUrl: pr.url, verified: verificationPassed };
    } catch (error: any) {
      console.error("[Pipeline] Generation Failed:", error);
      throw error;
    } finally {
      this.status = AgentStatus.IDLE;
    }
  }
}
