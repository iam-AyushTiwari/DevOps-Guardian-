import { Router, Request, Response } from "express";
import { SlackService, SecretsManagerService } from "@devops-guardian/shared";

const router = Router();
const secretsManager = new SecretsManagerService();

// POST /api/slack/config - Store Slack Configuration
router.post("/config", async (req: Request, res: Response): Promise<any> => {
  try {
    const { projectId, botToken, channelId } = req.body;

    if (!projectId || !botToken || !channelId) {
      return res
        .status(400)
        .json({ error: "Missing required fields: projectId, botToken, channelId" });
    }

    // Verify token works
    const slackService = new SlackService(botToken, channelId);
    const testResult = await slackService.testConnection();

    if (!testResult.success) {
      return res.status(400).json({ error: `Invalid Slack Credentials: ${testResult.error}` });
    }

    // Store in Secrets Manager
    await secretsManager.storeSlackConfig(projectId, botToken, channelId);

    return res.json({ success: true, message: "Slack configuration saved successfully" });
  } catch (error: any) {
    console.error("[Slack] Config save failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/slack/test - Test Slack connection
router.post("/test", async (req: Request, res: Response): Promise<any> => {
  try {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_ID;

    if (!botToken || !channelId) {
      return res.status(400).json({
        error: "SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be set in environment variables",
      });
    }

    const slackService = new SlackService(botToken, channelId);
    const result = await slackService.testConnection();

    if (result.success) {
      return res.json({
        message: "Slack connected successfully!",
        messageId: result.messageId,
      });
    } else {
      return res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error("[Slack] Test failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/slack/interactions - Handle button clicks
router.post("/interactions", async (req: Request, res: Response): Promise<any> => {
  try {
    const payload = JSON.parse(req.body.payload);

    if (payload.type === "block_actions") {
      const action = payload.actions[0];
      const incidentId = action.value;
      const channelId = payload.channel.id;
      // Use message_ts as thread_ts to reply to the message
      const threadTs = payload.container.message_ts;

      console.log(
        `[Slack] User ${payload.user.name} clicked: ${action.action_id} for incident: ${incidentId}`,
      );

      // Import orchestrator
      const { orchestrator } = await import("../orchestrator");

      if (action.action_id === "verify_fix") {
        // Trigger verification and thread reply
        orchestrator.handleVerificationRequest(incidentId, channelId, threadTs);
        return res.status(200).send();
      }

      if (action.action_id === "approve_pr") {
        // Ack immediately to prevent timeout
        orchestrator
          .handleApproval(incidentId)
          .then(() => console.log(`[Slack] Approval handled for ${incidentId}`))
          .catch((err) => console.error(`[Slack] Approval failed for ${incidentId}:`, err));

        return res.status(200).send();
      }

      if (action.action_id === "reject_fix") {
        console.log(`[Slack] Fix rejected for incident: ${incidentId}`);
        // Ack immediately
        orchestrator
          .handleRejection(incidentId)
          .then(() => console.log(`[Slack] Rejection handled for ${incidentId}`))
          .catch((err) => console.error(`[Slack] Rejection failed for ${incidentId}:`, err));

        return res
          .status(200)
          .json({ text: "❌ Fix rejected. Incident marked as RESOLVED (User Rejected)." });
      }
    }

    return res.status(200).send();
  } catch (error: any) {
    console.error("[Slack] Interaction failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

export { router as slackRouter };
