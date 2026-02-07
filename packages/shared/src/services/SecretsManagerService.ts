import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";

export class SecretsManagerService {
  private client: SecretsManagerClient;

  constructor(region: string = "us-east-1") {
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;

    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || region,
      credentials,
    });
    console.log(
      `[SecretsManager] Client initialized for region: ${process.env.AWS_REGION || region}`,
    );
  }

  /**
   * Generic method: Store any secrets under a custom secret name
   */
  async storeSecrets(secretName: string, secrets: Record<string, string>) {
    try {
      console.log(`[SecretsManager] Storing secret: ${secretName}...`);

      // Try creating first
      try {
        const command = new CreateSecretCommand({
          Name: secretName,
          SecretString: JSON.stringify(secrets),
          Description: "DevOps Guardian Secret",
        });
        await this.client.send(command);
        console.log(`[SecretsManager] Secret created successfully.`);
      } catch (error: any) {
        if (error.name === "ResourceExistsException") {
          // Update if already exists
          console.log(`[SecretsManager] Secret exists, updating...`);
          const updateCommand = new UpdateSecretCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(secrets),
          });
          await this.client.send(updateCommand);
          console.log(`[SecretsManager] Secret updated successfully.`);
        } else {
          throw error;
        }
      }

      return { success: true, secretName };
    } catch (error: any) {
      console.error(`[SecretsManager] Failed to store secret ${secretName}:`, error);
      throw error;
    }
  }

  /**
   * Generic method: Retrieve secrets by name
   */
  async getSecrets(secretName: string): Promise<Record<string, string>> {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.client.send(command);

      if (response.SecretString) {
        return JSON.parse(response.SecretString);
      }
      return {};
    } catch (error: any) {
      if (error.name === "ResourceNotFoundException") {
        // Quietly fail for non-existent secrets
        return {};
      }
      console.error(`[SecretsManager] Failed to get secret ${secretName}:`, error);
      throw error;
    }
  }

  /**
   * Stores a set of environment variables as a JSON secret.
   * Secret name format: devops-guardian/{owner}/{repo}/env
   */
  async storeEnvVars(owner: string, repo: string, envs: Record<string, string>) {
    const secretName = `devops-guardian/${owner}/${repo}/env`;
    return this.storeSecrets(secretName, envs);
  }

  async getEnvVars(owner: string, repo: string) {
    const secretName = `devops-guardian/${owner}/${repo}/env`;
    try {
      return await this.getSecrets(secretName);
    } catch (error) {
      console.error(`[SecretsManager] Failed to get env vars for ${owner}/${repo}:`, error);
      return {};
    }
  }

  /**
   * Store Slack configuration for a project
   */
  async storeSlackConfig(projectId: string, botToken: string, channelId: string) {
    const secretName = `devops-guardian/${projectId}/slack`;
    return this.storeSecrets(secretName, { botToken, channelId });
  }

  /**
   * Retrieve Slack configuration for a project
   */
  async getSlackConfig(projectId: string) {
    const secretName = `devops-guardian/${projectId}/slack`;
    try {
      return await this.getSecrets(secretName);
    } catch (error) {
      // It's okay if it doesn't exist, we'll return empty
      return {};
    }
  }

  /**
   * Store GitHub token for a project
   */
  async storeGitHubToken(projectId: string, token: string) {
    const secretName = `devops-guardian/${projectId}/github`;
    return this.storeSecrets(secretName, { token });
  }

  /**
   * Retrieve GitHub token for a project
   */
  async getGitHubToken(projectId: string): Promise<string | null> {
    const secretName = `devops-guardian/${projectId}/github`;
    try {
      const secrets = await this.getSecrets(secretName);
      return secrets.token || null;
    } catch (error) {
      return null;
    }
  }
}
