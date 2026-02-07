import { Router, Request, Response } from "express";
import axios from "axios";
import { db } from "@devops-guardian/shared";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3002";
const AUTH_REDIRECT = `${FRONTEND_URL}/onboarding`;

// 1. Redirect to GitHub
router.get("/github", (req, res) => {
  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const redirectPath = (req.query.redirect as string) || "/"; // Default to root

  console.log(
    "[Auth] Initiating GitHub OAuth with Client ID:",
    CLIENT_ID,
    "Redirecting back to:",
    redirectPath,
  );

  const redirectUri = "https://github.com/login/oauth/authorize";
  const scope = "repo workflow user"; // Read user + Write/Read Repo + Workflows
  const state = Buffer.from(redirectPath).toString("base64"); // Encode path in state

  const url = `${redirectUri}?client_id=${CLIENT_ID}&scope=${scope}&state=${state}`;
  res.redirect(url);
});

// 2. Callback
router.get("/github/callback", async (req: Request, res: Response): Promise<any> => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  if (!code) {
    return res.status(400).send("No code provided");
  }

  // Decode redirect path from state
  let redirectPath = "/";
  try {
    if (state) {
      redirectPath = Buffer.from(state, "base64").toString("utf-8");
    }
  } catch (e) {
    console.warn("[Auth] Failed to decode state, defaulting to root");
  }

  try {
    // Exchange Code for Token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } },
    );

    const { access_token, error } = tokenRes.data;

    if (error || !access_token) {
      throw new Error(error || "No access token code");
    }

    console.log(`[Auth] GitHub Token Obtained: ${access_token.substring(0, 5)}...`);

    // Redirect back to specific path with token
    const separator = redirectPath.includes("?") ? "&" : "?";
    res.redirect(`${FRONTEND_URL}${redirectPath}${separator}token=${access_token}`);
  } catch (error: any) {
    console.error("[Auth] Callback Failed:", error.message);
    res.status(500).send("Authentication Failed");
  }
});

export const authRouter = router;
