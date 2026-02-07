"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Activity,
  Server,
  ShieldAlert,
  Cpu,
  Terminal,
  ArrowRight,
} from "lucide-react";
import { API_URL } from "@/lib/config";

import { IncidentTerminal } from "@/components/monitoring/IncidentTerminal";

type Incident = {
  id: string;
  title: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  source: string;
  description: string;
  timestamp: string;
  status: string;
  statusMessage?: string;
  prUrl?: string;
  metadata?: any;
  agentRuns?: any[];
};

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchIncidents = async () => {
    try {
      const res = await fetch(`${API_URL}/incidents`);
      const data = await res.json();
      setIncidents(data.incidents || []);

      // Update selected incident if it exists to refresh logs
      if (selectedIncident) {
        const updated = (data.incidents || []).find((i: Incident) => i.id === selectedIncident.id);
        if (updated) setSelectedIncident(updated);
      }
    } catch (err) {
      console.error("Failed to fetch incidents", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 2000);
    return () => clearInterval(interval);
  }, [selectedIncident]); // Add selectedIncident dependency to refresh it

  return (
    <main className="min-h-screen bg-black text-white p-8 font-sans flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DevOps Guardian</h1>
            <p className="text-zinc-400 text-sm">Autonomous SRE Platform</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            <span className="text-xs font-medium">System Online</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            <span className="text-xs font-medium">Agents Ready</span>
          </div>
        </div>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Sidebar List (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Active Incidents
            </h2>
            <span className="text-zinc-500 text-sm">{incidents.length} events</span>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {incidents.length === 0 ? (
              <div className="p-12 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-500">
                <CheckCircle className="w-12 h-12 mb-4 text-green-500/50" />
                <p>All Operations Normal</p>
              </div>
            ) : (
              incidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => setSelectedIncident(incident)}
                  className="cursor-pointer"
                >
                  <IncidentCard
                    incident={incident}
                    selected={selectedIncident?.id === incident.id}
                  />
                </div>
              ))
            )}
          </div>

          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 mt-auto">
            <h3 className="text-sm font-medium text-zinc-400 mb-4">PLATFORM HEALTH</h3>
            <div className="space-y-4">
              <StatRow label="Uptime" value="99.99%" />
              <StatRow label="Mean Time to Resolve" value="45s" />
              <StatRow label="Active Agents" value="5" />
            </div>
          </div>
        </div>

        {/* Detail View (8 cols) */}
        <div className="lg:col-span-8 flex flex-col">
          {selectedIncident ? (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    {selectedIncident.title}
                    <Badge
                      text={selectedIncident.status.replace(/_/g, " ")}
                      color={selectedIncident.status === "RESOLVED" ? "green" : "purple"}
                      pulse={
                        selectedIncident.status !== "RESOLVED" &&
                        selectedIncident.status !== "FAILED"
                      }
                    />
                  </h2>
                  <p className="text-zinc-400 text-sm mt-1 font-mono">{selectedIncident.id}</p>
                </div>
                {selectedIncident.prUrl && (
                  <a
                    href={selectedIncident.prUrl}
                    target="_blank"
                    className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    View PR <ArrowRight className="w-3 h-3" />
                  </a>
                )}
              </div>

              <IncidentTerminal
                incidentId={selectedIncident.id}
                projectId={(selectedIncident.metadata as any)?.projectId || ""}
                agentRuns={selectedIncident.agentRuns || []}
                status={selectedIncident.status}
              />
            </div>
          ) : (
            <div className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/20 flex flex-col items-center justify-center text-zinc-500 p-12 text-center">
              <Cpu className="w-16 h-16 mb-6 opacity-20" />
              <h3 className="text-lg font-medium text-zinc-300">Select an Incident</h3>
              <p className="max-w-md mt-2">
                View real-time agent logs, RCA analysis, and sandbox verification details.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function IncidentCard({ incident, selected }: { incident: Incident; selected?: boolean }) {
  const isCritical = incident.severity === "CRITICAL";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all ${selected ? "border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"}`}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${isCritical ? "bg-red-500" : "bg-yellow-500"}`}
      />
      <div className="p-5 pl-7">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            {isCritical && <ShieldAlert className="w-4 h-4 text-red-500" />}
            <h3 className="font-semibold text-base">{incident.title}</h3>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            {new Date(incident.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-zinc-400 text-xs mb-3 line-clamp-1">{incident.description}</p>

        <div className="flex gap-2">
          <Badge text={incident.source} color="blue" />
          <Badge text={incident.severity} color={isCritical ? "red" : "yellow"} />
        </div>
      </div>
    </div>
  );
}

function Badge({ text, color, pulse }: { text: string; color: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${colors[color] || colors.blue}`}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {text}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-500 text-sm">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
