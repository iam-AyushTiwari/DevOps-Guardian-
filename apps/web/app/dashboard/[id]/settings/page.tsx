"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Copy } from "lucide-react";

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectName = decodeURIComponent(params.id as string);

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:3001/api/projects")
      .then((res) => res.json())
      .then((data) => {
        const found = data.projects.find((p: any) => p.name === projectName);
        setProject(found || null);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  }, [projectName]);

  if (loading) return <div className="p-12 text-zinc-500">Loading settings...</div>;
  if (!project) return <div className="p-12 text-white">Project not found.</div>;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getWebhookUrl = (id: string) => `http://localhost:3001/api/v1/logs/${id}`;

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center gap-4 mb-8 border-b border-zinc-800 pb-6">
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-white pl-0"
            onClick={() => router.back()}
          >
            ← Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Project Settings</h1>
            <p className="text-zinc-500 text-sm">Manage configuration for {projectName}</p>
          </div>
        </header>

        <div className="space-y-8">
          {/* General Information */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">General Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-zinc-400">Project Name</Label>
                <Input
                  value={project.name}
                  disabled
                  className="bg-zinc-900 border-zinc-800 text-zinc-300"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-400">GitHub Repository</Label>
                <div className="flex gap-2">
                  <Input
                    value={project.githubRepo}
                    disabled
                    className="bg-zinc-900 border-zinc-800 text-zinc-300"
                  />
                  <Button
                    variant="outline"
                    className="border-zinc-700"
                    onClick={() =>
                      window.open(`https://github.com/${project.githubRepo}`, "_blank")
                    }
                  >
                    Open
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Integration Details */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Integration Details</CardTitle>
              <CardDescription className="text-zinc-500">
                Use these details to configure your CI/CD pipelines or log shippers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-zinc-400">Project ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={project.id}
                    readOnly
                    className="bg-zinc-900 border-zinc-700 font-mono text-zinc-300"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => copyToClipboard(project.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-zinc-400">Webhook URL (Logs)</Label>
                <div className="flex gap-2">
                  <Input
                    value={getWebhookUrl(project.id)}
                    readOnly
                    className="bg-zinc-900 border-zinc-700 font-mono text-zinc-300"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => copyToClipboard(getWebhookUrl(project.id))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">
                  Send POST requests with JSON logs to this URL. We automatically detect errors.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="bg-red-950/10 border-red-900/30">
            <CardHeader>
              <CardTitle className="text-red-500">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-zinc-300">Delete Project</h4>
                  <p className="text-sm text-zinc-500">
                    Permanently delete this project and all associated incidents.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() =>
                    toast.error("Delete functionality temporarily disabled for safety.")
                  }
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Project
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
