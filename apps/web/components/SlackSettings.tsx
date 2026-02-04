"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";

interface SlackSettingsProps {
  projectId: string;
}

export function SlackSettings({ projectId }: SlackSettingsProps) {
  const [botToken, setBotToken] = useState("");
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!botToken || !channelId) {
      toast.error("Please fill in all fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/slack/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, botToken, channelId }),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success("Slack configured successfully! ✅");
        // Clear sensitive token from UI optionally, or keep it. Keeping it for now.
      } else {
        toast.error(data.error || "Failed to save configuration");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error. Is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.52v-6.315zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.52v2.52h-2.52zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.522 2.527 2.527 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.313z" />
          </svg>
          Slack Configuration
        </CardTitle>
        <p className="text-zinc-400 text-sm">Configure notifications for this project.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Bot User OAuth Token</label>
          <Input
            type="password"
            placeholder="xoxb-..."
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white"
          />
          <p className="text-xs text-zinc-500">Found in "OAuth & Permissions" sidebar.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Channel ID</label>
          <Input
            placeholder="C01234567"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white"
          />
          <p className="text-xs text-zinc-500">
            Right-click channel name &rarr; Copy Link &rarr; Last part.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {saving ? "Testing & Saving..." : "Save Configuration"}
        </Button>
      </CardFooter>
    </Card>
  );
}
