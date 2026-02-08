import type { Octokit } from "@octokit/rest";

export class GitHubService {
  private octokit!: Octokit;
  private initPromise: Promise<void>;

  constructor(authToken: string) {
    this.initPromise = this.initialize(authToken);
  }

  private async initialize(authToken: string): Promise<void> {
    // Type assertion to preserve dynamic import in CommonJS compilation
    const { Octokit } = await import("@octokit/rest") as typeof import("@octokit/rest");
    this.octokit = new Octokit({ 
      auth: authToken,
      userAgent: 'devops-guardian/0.1.0' // Recommended for GitHub API
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Validates the token and returns the authenticated user.
   */
  async getAuthenticatedUser() {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      return data;
    } catch (error: any) {
      console.error("[GitHub] Auth Failed:", error.message);
      throw new Error("Invalid GitHub Token");
    }
  }

  /**
   * Fetches file content from a repository.
   */
  async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(data) || !("content" in data)) {
        throw new Error("Path is a directory, not a file.");
      }

      return Buffer.from(data.content, "base64").toString("utf-8");
    } catch (error: any) {
      console.error(`[GitHub] Failed to fetch ${path}:`, error.message);
      throw error;
    }
  }

  /**
   * Lists repositories for the authenticated user.
   */
  async getUserRepositories() {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        visibility: "all",
        sort: "updated",
        per_page: 10,
      });
      return data;
    } catch (error: any) {
      console.error("[GitHub] Failed to list repos:", error.message);
      throw error;
    }
  }

  /**
   * Fetches the root directory structure of the repository.
   * Useful for detecting files like Jenkinsfile, package.json, etc.
   */
  async getRepoStructure(owner: string, repo: string, path: string = "") {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      // If single file, wrap in array
      return Array.isArray(data) ? data : [data];
    } catch (error: any) {
      if (error.status === 404) return [];
      console.error(`[GitHub] Failed to get structure for ${path}:`, error.message);
      throw error;
    }
  }

  /**
   * Commits a file to the repository.
   * Uses createOrUpdateFileContents.
   */
  async commitFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
  ) {
    await this.ensureInitialized();
    try {
      console.log(
        `[GitHub] Committing file to ${owner}/${repo}/${path} on branch ${branch || "default"}...`,
      );

      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
      });

      return { success: true, path };
    } catch (error: any) {
      console.error(`[GitHub] Failed to commit file ${path}:`, error.message);
      if (error.response) {
        console.error("[GitHub] Error Response:", JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  async createBranch(owner: string, repo: string, base: string, newBranch: string) {
    await this.ensureInitialized();
    try {
      const { data: ref } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${base}`,
      });
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranch}`,
        sha: ref.object.sha,
      });
      return true;
    } catch (e: any) {
      console.error(`[GitHub] Create branch failed: ${e.message}`);
      // If already exists, we might want to continue or error
      if (e.status === 422) return true; // Already exists
      throw e;
    }
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ) {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
      });
      return { success: true, number: data.number, url: data.html_url };
    } catch (e: any) {
      console.error(`[GitHub] Create PR failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * Fetches workflow run logs (for RCA analysis)
   */
  async getWorkflowLogs(owner: string, repo: string, runId: number): Promise<string> {
    await this.ensureInitialized();
    try {
      console.log(`[GitHub] Fetching logs for run ${runId}...`);

      // Get the download URL for logs
      const { url } = await this.octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });

      // Get job logs which might be more useful
      const { data: jobs } = await this.octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });

      // Find failed jobs
      const failedJobs = jobs.jobs.filter((job: any) => job.conclusion === "failure");

      if (failedJobs.length === 0) {
        return "No failed jobs found in this run.";
      }

      // Get logs for first failed job (simplified)
      const failedJob = failedJobs[0];
      const failedSteps = failedJob.steps?.filter((s: any) => s.conclusion === "failure") || [];

      const summary = `
Failed Job: ${failedJob.name}
Status: ${failedJob.conclusion}
Failed Steps: ${failedSteps.map((s: any) => s.name).join(", ")}
Job URL: ${failedJob.html_url}
Logs URL: ${url}
      `.trim();

      return summary;
    } catch (error: any) {
      console.error(`[GitHub] Failed to fetch workflow logs: ${error.message}`);
      return `Error fetching logs: ${error.message}`;
    }
  }

  /**
   * Gets failed workflow runs for a repository
   */
  async getFailedWorkflowRuns(owner: string, repo: string, limit: number = 5) {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        status: "failure",
        per_page: limit,
      });
      return data.workflow_runs;
    } catch (error: any) {
      console.error(`[GitHub] Failed to list workflow runs: ${error.message}`);
      return [];
    }
  }
}
