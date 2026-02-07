"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL } from "@/lib/config";

// Mock Data removed, using API
interface Project {
  id: string;
  name: string;
  githubRepo: string;
  githubToken?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // ...

  useEffect(() => {
    // 1. Check for Token in URL (from Auth Redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    if (tokenFromUrl) {
      localStorage.setItem("github_token", tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname); // Clean URL
    }

    const fetchProjects = async () => {
      try {
        const token = localStorage.getItem("github_token");
        const headers: any = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/api/projects`, { headers });
        // Handle 401 - maybe prompt login?

        const data = await res.json();
        if (data.projects) {
          setProjects(data.projects);
        }
      } catch (error) {
        console.error("Failed to fetch projects", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white">Projects</h1>
          <Button
            onClick={() => router.push("/onboarding?step=2")}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New
          </Button>
        </header>

        {/* Filters / Views (Visual only for now) */}
        <div className="flex justify-between items-center mb-6 text-sm text-zinc-400">
          <span>{projects.length} Projects Sort By: Recent Activity</span>
          <div className="bg-zinc-900 rounded-lg p-1 flex gap-1 border border-zinc-800">
            <button className="px-3 py-1 bg-zinc-800 text-white rounded-md shadow-sm">
              Architecture
            </button>
            <button className="px-3 py-1 hover:text-white transition-colors">List</button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 h-[280px] flex flex-col justify-between"
              >
                <Skeleton className="h-32 w-full rounded-lg mb-6" />
                <div>
                  <Skeleton className="h-5 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/dashboard/${project.name}`)}
                className="group relative bg-zinc-950 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all cursor-pointer overflow-hidden"
              >
                {/* "Working on it" Badge - Mock logic for now tailored to Specific naming if needed, or remove until real socket */}
                {/* 
              {project.isFixing && (
                  <div className="absolute top-0 right-0 p-3">
                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 animate-pulse border-blue-500/20">
                          Fixing Issue...
                      </Badge>
                  </div>
              )} 
              */}

                <div className="h-32 mb-6 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center bg-zinc-900/30 group-hover:bg-zinc-900/50 transition-colors">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <h3 className="font-semibold text-white text-base mb-1 group-hover:text-purple-400 transition-colors">
                  {project.name}
                </h3>

                <div className="flex items-center gap-2 mt-4 text-xs text-zinc-500">
                  <div className={`w-2 h-2 rounded-full bg-green-500`}></div>
                  <span>production</span>
                  <span className="mx-1">•</span>
                  <span>{project.githubRepo}</span>
                </div>

                {/* Slack Warning Badge */}
                {!(project as any).slackConfigured && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Slack Not Connected</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
