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

type Incident = {
  id: string;
  title: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  source: string;
  description: string;
  timestamp: string;
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
  }, []);

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
          <StatusBadge label="System Online" status="active" />
          <StatusBadge label="Agents Ready" status="active" />
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

          <div className="space-y-4">
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
        <div className="lg:col-span-8">
          {selectedIncident ? (
            <DetailView incident={selectedIncident} />
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
      className={`group relative overflow-hidden rounded-xl border transition-all ${selected ? "border-blue-500 bg-blue-500/5" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"}`}
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

function DetailView({ incident }: { incident: Incident }) {
  return (
    <div className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {incident.title}
            <Badge text="Resolving" color="purple" pulse />
          </h2>
          <p className="text-zinc-400 text-sm mt-1">{incident.id}</p>
        </div>
        <button className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors">
          View on GitHub
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-8 overflow-y-auto flex-1">
        {/* Workflow Steps */}
        <div className="flex items-center gap-4">
          <Step status="complete" label="Monitor" />
          <Arrow />
          <Step status="active" label="RCA Agent" />
          <Arrow />
          <Step status="pending" label="Patch Agent" />
          <Arrow />
          <Step status="pending" label="Verification" />
        </div>

        {/* Agent Logs (Mocked for UI demo) */}
        <div className="bg-black rounded-xl border border-zinc-800 p-4 font-mono text-sm leading-relaxed overflow-hidden">
          <div className="flex items-center gap-2 text-zinc-500 mb-4 border-b border-zinc-800 pb-2">
            <Terminal className="w-4 h-4" />
            <span>Agent Live Logs</span>
          </div>
          <div className="space-y-2">
            <LogLine
              time="12:25:38"
              level="INFO"
              msg="Received Incident: Mock GitHub Actions Failure"
            />
            <LogLine time="12:25:39" level="INFO" msg="[RCA] Starting analysis..." />
            <LogLine
              time="12:25:40"
              level="WARN"
              msg="[RCA] Gemini API Key missing (Using Mock Context)"
            />
            <LogLine
              time="12:25:41"
              level="INFO"
              msg="[Orchestrator] Proceeding to Patch Agent..."
            />
            <LogLine time="12:25:42" level="INFO" msg="[Patch] Generating Diff for src/db.ts..." />
            <div className="pl-4 border-l-2 border-zinc-700 my-2 opacity-70">
              <p className="text-green-400">+ const poolSize = 20;</p>
              <p className="text-red-400">- const poolSize = 5;</p>
            </div>
            <LogLine time="12:25:45" level="INFO" msg="[Verify] Booting E2B Sandbox..." />
          </div>
        </div>
      </div>
    </div>
  );
}

function LogLine({ time, level, msg }: { time: string; level: string; msg: string }) {
  const color =
    level === "INFO" ? "text-blue-400" : level === "WARN" ? "text-yellow-400" : "text-zinc-400";
  return (
    <div className="flex gap-3">
      <span className="text-zinc-600 select-none">{time}</span>
      <span className={`font-bold w-12 ${color}`}>{level}</span>
      <span className="text-zinc-300">{msg}</span>
    </div>
  );
}

function Step({ status, label }: { status: "complete" | "active" | "pending"; label: string }) {
  const styles = {
    complete: "bg-green-500/10 text-green-500 border-green-500/20",
    active: "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse",
    pending: "bg-zinc-800/50 text-zinc-500 border-zinc-800",
  };

  return (
    <div className={`px-4 py-2 rounded-lg border text-sm font-medium ${styles[status]}`}>
      {label}
    </div>
  );
}

function Arrow() {
  return <ArrowRight className="w-4 h-4 text-zinc-600" />;
}

function Badge({ text, color, pulse }: { text: string; color: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${colors[color]}`}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {text}
    </span>
  );
}

function StatusBadge({ label, status }: { label: string; status: "active" | "inactive" }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
      <span
        className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-zinc-600"}`}
      />
      <span className="text-xs font-medium">{label}</span>
    </div>
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
