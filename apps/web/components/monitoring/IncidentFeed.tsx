"use client";

import { useEffect, useState } from "react";
import { socketService } from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import { Activity, CheckCircle2, AlertTriangle, GitPullRequest, History } from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/config";
import { useIncidentStore } from "@/lib/store";
import { IncidentTerminal } from "./IncidentTerminal";

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

export function IncidentFeed({ projectId, statusFilter }: IncidentFeedProps) {
  const { incidents, setIncidents, updateIncident, setAgentRuns } = useIncidentStore();
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
          const matchesId =
            meta?.projectId === projectId || meta?.owner + "/" + meta?.repo === projectId;
          if (!matchesId) return; // Ignore irrelevant events
        }
        updateIncident(updatedIncident);
      };

      const handleAgentRun = ({ incidentId, agentRun }: { incidentId: string; agentRun: any }) => {
        const incident = useIncidentStore.getState().incidents.find((i) => i.id === incidentId);
        if (incident) {
          const runs = [...(incident.agentRuns || [])];
          const idx = runs.findIndex((r) => r.id === agentRun.id);
          if (idx >= 0) runs[idx] = agentRun;
          else runs.push(agentRun);

          setAgentRuns(incidentId, runs);
        }
      };

      socket.on("incident:update", handleUpdate);
      socket.on("agent:run", handleAgentRun);

      return () => {
        socket.off("incident:update", handleUpdate);
        socket.off("agent:run", handleAgentRun);
      };
    }
  }, [projectId, statusFilter, setIncidents, updateIncident, setAgentRuns]);

  // Filter incidents from store based on current projectId
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
                  <p className="text-xs text-zinc-500 font-mono flex items-center gap-2">
                    {new Date(incident.timestamp).toLocaleString()}
                    {(incident as any).source === "MANUAL_REPORT" && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                        User Reported
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge status={incident.status} />
              </div>

              {/* Progress Bar / Status Message */}
              <div className="text-xs bg-black/40 border border-zinc-800 p-2.5 rounded flex items-center justify-between">
                <span className="font-mono text-zinc-400 flex items-center gap-2">
                  {incident.statusMessage ? (
                    <>
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
              {expandedId === incident.id && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <IncidentTerminal
                    incidentId={incident.id}
                    projectId={projectId || (incident.metadata as any)?.projectId || ""}
                    agentRuns={incident.agentRuns || []}
                    status={incident.status}
                  />
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
