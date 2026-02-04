"use client";

import { useEffect, useState } from "react";
import { socketService } from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  GitPullRequest,
  Loader2,
  History,
} from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/config";

interface Incident {
  id: string;
  title: string;
  status: string;
  statusMessage?: string;
  prUrl?: string;
  timestamp: string;
  metadata?: any;
  agentRuns?: AgentRun[];
}

interface AgentRun {
  id: string;
  agentName: string;
  status: "IDLE" | "WORKING" | "COMPLETED" | "FAILED" | "WAITING_FOR_USER";
  thoughts?: string;
  output?: any;
  startedAt: string;
  completedAt?: string;
}

interface IncidentFeedProps {
  projectId?: string;
  statusFilter?: string;
}

import { useIncidentStore } from "@/lib/store";

export function IncidentFeed({ projectId, statusFilter }: IncidentFeedProps) {
  const { incidents, setIncidents, updateIncident, addIncident } = useIncidentStore();
  const [historyIncidents, setHistoryIncidents] = useState<Incident[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    // Construct URL for initial fetch
    const baseUrl = `${API_URL}/incidents`;
    const params = new URLSearchParams();
    if (projectId) params.append("projectId", projectId);
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${baseUrl}?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (statusFilter === "RESOLVED") {
          // If we are in history mode, populate local state
          setHistoryIncidents(data.incidents || []);
        } else {
          // Otherwise, populate the global store for active incidents
          if (data.incidents) setIncidents(data.incidents);
        }
      })
      .catch((e) => console.error("Failed to fetch initial incidents", e));

    // Conditionally connect to socket only for active incidents (when statusFilter is not set)
    if (!statusFilter) {
      const socket = socketService.connect();

      const handleUpdate = (updatedIncident: Incident) => {
        // client-side filter for socket events
        if (projectId) {
          const meta = updatedIncident.metadata;
          // Check if this incident belongs to the current project
          const matchesId = meta?.projectId === projectId;
          if (!matchesId) return; // Ignore irrelevant events
        }

        // Check if it exists to decide add or update
        const existing = incidents.find((i) => i.id === updatedIncident.id);
        if (existing) {
          updateIncident(updatedIncident);
        } else {
          addIncident(updatedIncident);
        }
      };

      socket.on("incident:update", handleUpdate);

      return () => {
        socket.off("incident:update", handleUpdate);
      };
    }
  }, [projectId, statusFilter, incidents, setIncidents, updateIncident, addIncident]); // Depend on projectId and statusFilter

  // Filter incidents from store based on current projectId to ensure we don't show mixed data
  // if the store holds all. (Currently store holds what we fetch.
  // Ideally store should be a map or we just filter here).
  const displayIncidents =
    statusFilter === "RESOLVED"
      ? historyIncidents
      : projectId
        ? incidents.filter((i) => {
            const meta = i.metadata as any;
            return (
              meta?.projectId === projectId ||
              i.metadata?.owner + "/" + i.metadata?.repo === projectId
            );
          })
        : incidents;

  return (
    <Card className="h-full border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl">
      <CardHeader className="border-b border-zinc-800/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          {statusFilter === "RESOLVED" ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Resolved History
            </>
          ) : (
            <>
              <Activity className="h-5 w-5 text-purple-500" />
              Active Incidents
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {displayIncidents.length === 0 && (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-lg bg-zinc-900/50">
              {statusFilter === "RESOLVED" ? (
                <>
                  <History className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
                  <p>No resolved incidents yet.</p>
                  <p className="text-sm">Fixes will appear here after verification.</p>
                  <p className="text-xs text-zinc-800 mt-2 font-mono">Debug: {projectId}</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500/20" />
                  <p>No active incidents.</p>
                  <p className="text-sm">System is healthy & monitoring.</p>
                </>
              )}
            </div>
          )}
          {displayIncidents.map((incident) => (
            <div
              key={incident.id}
              onClick={() => setExpandedId(expandedId === incident.id ? null : incident.id)}
              className={`group flex flex-col gap-3 rounded-lg border bg-zinc-900/50 p-4 transition-all cursor-pointer ${
                expandedId === incident.id
                  ? "border-zinc-600 shadow-md ring-1 ring-zinc-700"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-zinc-200 leading-tight mb-1">
                    {incident.title}
                  </h4>
                  <p className="text-xs text-zinc-500 font-mono">
                    {new Date(incident.timestamp).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={incident.status} />
              </div>

              {/* Progress Bar / Status Message */}
              <div className="text-xs bg-black/40 border border-zinc-800 p-2.5 rounded flex items-center justify-between">
                <span className="font-mono text-zinc-400 flex items-center gap-2">
                  {incident.statusMessage ? (
                    <>
                      {/* Status-specific icons or loaders */}
                      {incident.statusMessage.includes("Analyzing") && (
                        <AnimatedLoader variant="dots" />
                      )}
                      {incident.statusMessage.includes("Generating") && (
                        <AnimatedLoader variant="wave" className="h-[10px]" />
                      )}
                      {incident.statusMessage.includes("Verifying") && (
                        <AnimatedLoader variant="pulse" />
                      )}

                      <span>{incident.statusMessage}</span>
                    </>
                  ) : incident.status === "RESOLVED" ? (
                    "Resolution verified and deployed."
                  ) : (
                    "Initializing agent workflow..."
                  )}
                </span>
                {isWorking(incident.status) && (
                  // Global indicator
                  <div className="opacity-50">
                    <AnimatedLoader variant="wave" className="h-2 scale-75" />
                  </div>
                )}
              </div>

              {/* PR Link */}
              {incident.prUrl && (
                <Link
                  href={incident.prUrl}
                  target="_blank"
                  className="mt-1 flex items-center gap-2 text-xs font-medium text-purple-400 hover:text-purple-300 hover:underline"
                >
                  <GitPullRequest className="h-3 w-3" />
                  Review Fix PR
                </Link>
              )}

              {/* Expanded Agent History */}
              {expandedId === incident.id &&
                incident.agentRuns &&
                incident.agentRuns.length > 0 && (
                  <div className="mt-4 border-t border-zinc-800 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                      Execution Timeline
                    </h5>
                    <div className="space-y-6 relative pl-4 border-l border-zinc-800 ml-1">
                      {incident.agentRuns.map((run, idx) => (
                        <div key={run.id} className="relative">
                          <div
                            className={`absolute -left-[21px] top-1.5 h-3 w-3 rounded-full border ${
                              run.status === "COMPLETED"
                                ? "bg-green-500/20 border-green-500"
                                : run.status === "FAILED"
                                  ? "bg-red-500/20 border-red-500"
                                  : "bg-zinc-800 border-zinc-600"
                            }`}
                          />
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-zinc-200">
                              {getAgentDisplayName(run.agentName)}
                            </span>
                            <span className="text-[10px] text-zinc-600 font-mono">
                              {new Date(run.startedAt).toLocaleTimeString()}
                            </span>
                          </div>

                          {run.thoughts && (
                            <div className="bg-zinc-950 border border-zinc-800/50 p-3 rounded-md text-xs font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed shadow-inner">
                              <span className="text-purple-400 font-bold opacity-50 block mb-1">
                                THOUGHTS:
                              </span>
                              {run.thoughts}
                            </div>
                          )}
                          {run.status === "FAILED" && (
                            <p className="text-xs text-red-400 mt-2">Agent Failed</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status = "UNKNOWN" }: { status?: string }) {
  if (status === "RESOLVED")
    return (
      <Badge
        variant="default"
        className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
      >
        <CheckCircle2 className="mr-1.5 h-3 w-3" /> Resolved
      </Badge>
    );
  if (status === "AWAITING_APPROVAL")
    return (
      <Badge
        variant="secondary"
        className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
      >
        <AlertTriangle className="mr-1.5 h-3 w-3" /> Approval Needed
      </Badge>
    );

  // Map UNKNOWN to a cleaner "Pending" state if desired, or keep as is
  const displayStatus = status === "UNKNOWN" ? "PENDING" : status.replace(/_/g, " ");

  return (
    <Badge variant="outline" className="border-blue-500/20 text-blue-400 bg-blue-500/10 gap-2">
      <AnimatedLoader variant="pulse" className="scale-75" /> {displayStatus}
    </Badge>
  );
}

function isWorking(status: string) {
  return status !== "RESOLVED" && status !== "AWAITING_APPROVAL" && status !== "FAILED";
}

type IncomingIncident = Incident;

function getAgentDisplayName(name: string) {
  switch (name) {
    case "RCA":
      return "Context Fetcher";
    case "Patch":
      return "Logic Engine";
    case "Verify":
      return "Verification Sandbox";
    default:
      return name;
  }
}
