"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SlackSettings } from "@/components/SlackSettings";

interface SetupGuideProps {
  projectId: string;
  projectName: string;
  slackConfigured?: boolean;
}

export function MonitoringSetupGuide({ projectId, projectName, slackConfigured }: SetupGuideProps) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<"aws" | "datadog">("aws");
  const [step, setStep] = useState<"webhook" | "slack">("webhook");

  useEffect(() => {
    fetchWebhookDetails();
  }, [projectId]);

  const fetchWebhookDetails = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/v1/logs/${projectId}/token`);
      const data = await res.json();
      setWebhookUrl(data.webhookUrl);
      setToken(data.token);
    } catch (error) {
      console.error("Failed to fetch webhook details:", error);
      toast.error("Failed to load webhook configuration");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  if (loading) {
    return (
      <Card className="bg-zinc-950 border-zinc-800 text-white">
        <CardContent className="p-6">
          <div className="text-zinc-400">Loading webhook configuration...</div>
        </CardContent>
      </Card>
    );
  }

  const awsInstructions = [
    {
      step: "1",
      title: "Go to Kinesis Data Firehose in the AWS Console",
      detail: "Open AWS Console → Kinesis → Data Firehose",
    },
    {
      step: "2",
      title: 'Create a "Delivery Stream" with Destination: HTTP Endpoint',
      detail: `Click "Create delivery stream"\nDestination: HTTP Endpoint\nEndpoint URL: ${webhookUrl}\nAdd custom header: Authorization = Bearer ${token}`,
    },
    {
      step: "3",
      title: "Set S3 Backup for failures",
      detail: "Choose an S3 bucket for failed deliveries (recommended)",
    },
    {
      step: "4",
      title: "Add a Subscription Filter to your Log Group",
      detail:
        "Go to CloudWatch → Log groups → Your log group\nActions → Create subscription filter\nDestination: Kinesis Data Firehose\nSelect the delivery stream you created",
    },
  ];

  const datadogInstructions = [
    {
      step: "1",
      title: "Navigate to Logs > Configuration > Forwarding",
      detail: "In Datadog UI, go to Logs → Configuration → Log Forwarding",
    },
    {
      step: "2",
      title: "Click New Destination and select Custom Webhook",
      detail: `Webhook URL: ${webhookUrl}`,
    },
    {
      step: "3",
      title: "Add x-guardian-token to the headers",
      detail: `Header name: x-guardian-token\nHeader value: ${token}`,
    },
    {
      step: "4",
      title: "Set the filter to status:error to save on data costs",
      detail: "Filter: status:error OR status:critical\n(This only forwards errors to Guardian)",
    },
  ];

  const instructions = selectedProvider === "aws" ? awsInstructions : datadogInstructions;
  if (step === "slack") {
    return (
      <div className="space-y-6">
        {/* Slack Configuration Step */}
        {slackConfigured ? (
          <div className="bg-green-950/20 border border-green-900/50 rounded-xl p-8 text-center mb-6">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✅</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Slack is Already Configured</h3>
            <p className="text-zinc-400 max-w-md mx-auto">
              This project is already connected to Slack. Notifications will be sent to your
              configured channel.
            </p>
            <Button
              onClick={() => (window.location.href = `/dashboard/${projectName}/settings`)}
              variant="outline"
              className="mt-6 border-zinc-800 text-zinc-400 hover:text-white"
            >
              Update Settings
            </Button>
          </div>
        ) : (
          <SlackSettings projectId={projectId} />
        )}
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => setStep("webhook")}
            className="text-zinc-400 hover:text-white"
          >
            Back to Webhook
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => (window.location.href = `/dashboard/${projectName}`)}
              className="border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
            >
              Skip for now
            </Button>
            <Button
              onClick={() => (window.location.href = `/dashboard/${projectName}`)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Finish Setup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-950 border-zinc-800 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">🔗</span>
            Guardian Webhook Setup (Step 1/2)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook Details */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Your Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  readOnly
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-white"
                />
                <Button
                  onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
                >
                  Copy
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm text-zinc-400 block mb-1">Your Authentication Token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  readOnly
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-white"
                />
                <Button
                  onClick={() => copyToClipboard(token, "Token")}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="flex gap-3 pt-4 border-t border-zinc-800">
            <Button
              onClick={() => setSelectedProvider("aws")}
              variant={selectedProvider === "aws" ? "default" : "outline"}
              className={
                selectedProvider === "aws"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "border-zinc-700 text-zinc-800 hover:bg-zinc-800"
              }
            >
              ☁️ AWS CloudWatch
            </Button>
            <Button
              onClick={() => setSelectedProvider("datadog")}
              variant={selectedProvider === "datadog" ? "default" : "outline"}
              className={
                selectedProvider === "datadog"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "border-zinc-700 text-zinc-800 hover:bg-zinc-800"
              }
            >
              🐕 Datadog
            </Button>
          </div>

          {/* Setup Instructions */}
          <div className="space-y-4">
            <h3 className="text-md font-semibold text-white">
              {selectedProvider === "aws" ? "AWS CloudWatch" : "Datadog"} Setup Instructions
            </h3>

            {instructions.map((instruction) => (
              <div
                key={instruction.step}
                className="bg-zinc-900 rounded-lg p-4 border border-zinc-800"
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold">
                    {instruction.step}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-medium mb-1">{instruction.title}</h4>
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                      {instruction.detail}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Info Box */}
          <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-4">
            <div className="flex gap-2">
              <span className="text-blue-400">ℹ️</span>
              <div className="text-sm text-blue-300">
                <strong>Zero Credentials Required:</strong> Guardian never stores your AWS or
                Datadog credentials. You control what logs are sent using subscription filters.
              </div>
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-end pt-4 border-t border-zinc-800">
            <Button
              onClick={() => setStep("slack")}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Next: Configure Notifications →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
