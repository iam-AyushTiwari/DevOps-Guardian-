"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MonitoringSetupGuide } from "@/components/MonitoringSetupGuide";
import { LiveLogStream } from "@/components/monitoring/LiveLogStream";
import { IncidentFeed } from "@/components/monitoring/IncidentFeed";
import { API_URL } from "@/lib/config";
import { useIncidentStore } from "@/lib/store";

interface Project {
  id: string;
  name: string;
  githubRepo: string;
  githubToken?: string;
}

function StatsCards({ projectId }: { projectId: string }) {
  const { incidents } = useIncidentStore();
  const activeIncidents = incidents.filter((i) => {
    const meta = i.metadata as any;
    return (
      meta?.projectId === projectId || i.metadata?.owner + "/" + i.metadata?.repo === projectId
    );
  });

  const count = activeIncidents.length;
  // Simple health score logic: 100 - (10 * incident_count), min 0
  const healthScore = Math.max(0, 100 - count * 10);

  return (
    <>
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-md font-medium text-zinc-400">Health Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${healthScore < 80 ? "text-yellow-500" : "text-white"}`}
          >
            {healthScore}%
          </div>
          <p className="text-xs text-zinc-500 mt-1">Based on active incidents</p>
        </CardContent>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-md font-medium text-zinc-400">Active Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{count}</div>
          <p className="text-xs text-zinc-500 mt-1">
            {count === 0 ? "All systems operational" : "Attention required"}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-md font-medium text-zinc-400">Auto-Healing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">Ready</div>
          <p className="text-xs text-zinc-500 mt-1">Production monitoring active</p>
        </CardContent>
      </Card>
    </>
  );
}
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectName = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/projects");
        const data = await res.json();
        const found = data.projects.find(
          (p: Project) => p.name === decodeURIComponent(projectName),
        );
        setProject(found || null);
      } catch (error) {
        console.error("Failed to fetch project", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8 font-sans">
        <div className="max-w-6xl mx-auto">
          {/* Header Skeleton */}
          <div className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-6">
            <div>
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-10 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>

          {/* Tabs Skeleton */}
          <div className="space-y-6">
            <Skeleton className="h-10 w-full mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!project)
    return <div className="p-8 text-white">Project not found with name: {projectName}</div>;

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-6">
          <div>
            <Button
              variant="ghost"
              className="mb-2 pl-0 hover:bg-transparent text-zinc-400 hover:text-white"
              onClick={() => router.back()}
            >
              ← Back to Projects
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              {project.name}
              <Badge variant="outline" className="border-green-500 text-green-500 bg-green-500/10">
                Online
              </Badge>
            </h1>
            <p className="text-zinc-500 mt-1 font-mono text-sm">{project.githubRepo}</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-zinc-700 text-white bg-zinc-700 hover:bg-zinc-800"
              onClick={() => router.push(`/dashboard/${encodeURIComponent(project.name)}/settings`)}
            >
              Settings
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={async () => {
                toast.info("Starting manual scan...");
                try {
                  await fetch(`${API_URL}/api/projects/${project.id}/scan`, {
                    method: "POST",
                  });
                  toast.success("Scan initiated! Check Incidents tab.");
                } catch (e) {
                  toast.error("Failed to trigger scan");
                }
              }}
            >
              Trigger Scan
            </Button>
          </div>
        </header>

        {/* Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="history">Resolved History</TabsTrigger>
            <TabsTrigger value="logs">Live Logs</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring Setup</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCards projectId={project.id} />
            </div>

            {/* Quick View of Incidents on Overview */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
              <IncidentFeed projectId={project.id} />
            </div>
          </TabsContent>

          {/* Incidents Tab */}
          <TabsContent value="incidents">
            <IncidentFeed projectId={project.id} />
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <IncidentFeed projectId={project.id} statusFilter="RESOLVED" />
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            <LiveLogStream projectId={project.id} />
          </TabsContent>

          {/* Monitoring Tab */}
          <TabsContent value="monitoring">
            <MonitoringSetupGuide projectId={project.id} projectName={project.name} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
