"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, Play } from "lucide-react";
import { socketService } from "@/lib/socket";
import ReactMarkdown from "react-markdown";

interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  source: string;
}

interface AgentRun {
  id: string;
  agentName: string;
  status: "IDLE" | "WORKING" | "COMPLETED" | "FAILED" | "WAITING_FOR_USER";
  thoughts?: string;
  startedAt: string;
}

interface IncidentTerminalProps {
  incidentId: string;
  projectId: string;
  agentRuns: AgentRun[];
  status: string;
}

// Stages definition
const STAGES = [
  { id: "MONITOR", label: "Monitor", agent: null },
  { id: "RCA", label: "RCA Agent", agent: "RCA" },
  { id: "PATCH", label: "Patch Agent", agent: "Patch" },
  { id: "VERIFY", label: "Verification", agent: "Verify" },
];

export function IncidentTerminal({
  incidentId,
  projectId,
  agentRuns,
  status,
}: IncidentTerminalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Determine Current Stage
  const currentStageIndex = STAGES.findIndex((stage) => {
    if (!stage.agent) return false; // Monitor is always "done" once we have an incident
    const run = agentRuns.find((r) => r.agentName === stage.agent);
    return run?.status === "WORKING";
  });

  // Logic to determine completed stages
  const getStageStatus = (stageId: string, agentName: string | null) => {
    // If the incident is fully resolved, everything should look "Completed"
    // This handles the "History" view where we want to show a green pipeline
    if (status === "RESOLVED") return "COMPLETED";

    if (stageId === "MONITOR") return "COMPLETED"; // Always started
    const run = agentRuns.find((r) => r.agentName === agentName);
    if (!run) return "PENDING";
    return run.status;
  };

  // 2. Synthesize Logs from Agent Runs + Real-time Socket
  useEffect(() => {
    const historicalLogs: LogEntry[] = [];

    // Add "Incident Detected"
    historicalLogs.push({
      timestamp: new Date().toISOString(), // Approximation if we don't have incident start
      level: "INFO",
      source: "Monitor",
      message: `Incident ${incidentId.substring(0, 8)} Detected. Orchestrator initialized.`,
    });

    agentRuns.forEach((run) => {
      historicalLogs.push({
        timestamp: run.startedAt,
        level: "INFO",
        source: "Orchestrator",
        message: `Starting ${run.agentName} Agent...`,
      });

      if (run.thoughts) {
        historicalLogs.push({
          timestamp: run.startedAt, // Using start time, though ideally thoughts have their own stamps
          level: "INFO",
          source: run.agentName,
          message: run.thoughts,
        });
      }

      if (run.status === "FAILED") {
        historicalLogs.push({
          timestamp: new Date().toISOString(),
          level: "ERROR",
          source: run.agentName,
          message: `${run.agentName} Failed.`,
        });
      }
    });

    // Merge with historical logs
    setLogs(historicalLogs);
  }, [agentRuns, incidentId]); // Include incidentId dependency

  // Socket Connection for Real-time updates
  useEffect(() => {
    const socket = socketService.connect();
    const handleLog = (data: any) => {
      // Filter for THIS SPECIFIC incident
      if (data.incidentId === incidentId) {
        setLogs((prev) => [
          ...prev,
          {
            timestamp: data.timestamp || new Date().toISOString(),
            level: data.level || "INFO",
            source: data.source || "System",
            message: data.log,
          },
        ]);
      }
    };
    socket.on("log:received", handleLog);
    return () => {
      socket.off("log:received", handleLog);
    };
  }, [incidentId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full bg-black/90 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs shadow-2xl">
      {/* Top Bar: Stages */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {STAGES.map((stage, idx) => {
            const status = getStageStatus(stage.id, stage.agent);
            const isActive = status === "WORKING";
            const isCompleted = status === "COMPLETED";
            const isFailed = status === "FAILED";

            return (
              <div key={stage.id} className="flex items-center">
                <div
                  className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all
                            ${
                              isActive
                                ? "bg-purple-500/10 border-purple-500 text-purple-400"
                                : isCompleted
                                  ? "bg-green-500/10 border-zinc-800 text-zinc-400"
                                  : isFailed
                                    ? "bg-red-500/10 border-red-500 text-red-400"
                                    : "bg-transparent border-zinc-800 text-zinc-600 opacity-50"
                            }
                        `}
                >
                  {isActive ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : isFailed ? (
                    <Circle className="w-3 h-3 fill-current" />
                  ) : (
                    <Circle className="w-3 h-3" />
                  )}
                  <span className="font-semibold tracking-wide uppercase text-[10px]">
                    {stage.label}
                  </span>
                </div>
                {idx < STAGES.length - 1 && <div className="w-4 h-[1px] bg-zinc-800 mx-1" />}
              </div>
            );
          })}
        </div>

        {/* Gemini 3 Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-purple-500/20">
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <span className="text-[10px] uppercase font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 tracking-wider">
            Powered by Gemini 3 Pro
          </span>
        </div>
      </div>

      {/* Terminal Window */}
      <div
        ref={scrollRef}
        className="h-[400px] overflow-y-auto p-4 space-y-2 bg-[#0c0c0c] text-zinc-300 selection:bg-purple-500/30"
      >
        <div className="text-zinc-500 mb-4 select-none">
          &gt;_ Agent Live Logs session_id={incidentId.substring(0, 8)}...
        </div>

        {logs.map((log, i) => (
          <div
            key={i}
            className="flex items-start gap-3 group hover:bg-zinc-900/30 p-0.5 rounded -mx-2 px-2 transition-colors"
          >
            <span className="text-zinc-600 shrink-0 select-none w-20">
              {new Date(log.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>

            <span
              className={`shrink-0 font-bold w-16 uppercase text-[10px] py-0.5
                    ${
                      log.level === "INFO"
                        ? "text-blue-500"
                        : log.level === "WARN"
                          ? "text-yellow-500"
                          : log.level === "ERROR"
                            ? "text-red-500"
                            : "text-zinc-500"
                    }
                `}
            >
              {log.level}
            </span>

            <span className="text-zinc-500 shrink-0 w-24 truncate" title={log.source}>
              [{log.source}]
            </span>

            <div className="break-all whitespace-pre-wrap flex-1 text-zinc-300 font-mono text-xs">
              <LogMessage message={log.message} />
            </div>
          </div>
        ))}

        {/* Blinking Cursor at bottom of active stream */}
        {status !== "RESOLVED" && <div className="animate-pulse text-purple-500 mt-2">_</div>}
      </div>
    </div>
  );
}

function LogMessage({ message }: { message: string }) {
  // 1. Try Parse JSON first
  try {
    if (
      typeof message === "string" &&
      (message.trim().startsWith("{") || message.trim().startsWith("["))
    ) {
      const parsed = JSON.parse(message);

      // RCA Result
      if (parsed.data?.analysis) {
        return (
          <div className="flex flex-col gap-1 mt-1 border-l-2 border-purple-500/50 pl-3">
            <span className="text-purple-400 font-bold text-[10px] uppercase">
              Analysis Insight:
            </span>
            <span className="text-zinc-300">{parsed.data.analysis}</span>
          </div>
        );
      }

      // Patch Result
      if (parsed.data?.summary) {
        return (
          <div className="flex flex-col gap-1 mt-1 border-l-2 border-green-500/50 pl-3">
            <span className="text-green-400 font-bold text-[10px] uppercase">Patch Strategy:</span>
            <span className="text-zinc-300">{parsed.data.summary}</span>
          </div>
        );
      }

      // Generic "thought" or "log" field
      if (parsed.thought || parsed.log || parsed.message) {
        return (
          <span className="text-blue-300">{parsed.thought || parsed.log || parsed.message}</span>
        );
      }

      // Verification Result
      if (parsed.data?.results) {
        const passed = parsed.success;
        return (
          <div
            className={`mt-1 p-2 rounded bg-opacity-10 border ${passed ? "bg-green-500 border-green-500/30" : "bg-red-500 border-red-500/30"}`}
          >
            <span className={passed ? "text-green-400" : "text-red-400"}>
              {passed ? "✅ Verification Passed" : "❌ Verification Failed"}
            </span>
          </div>
        );
      }
    }
  } catch {}

  // 2. Formatting for standard string logs
  if (message.includes("[E2B]")) {
    return <span className="text-cyan-400">{message}</span>;
  }

  // Highlight keywords
  if (message.includes("Error") || message.includes("Failed"))
    return <span className="text-red-400">{message}</span>;
  if (message.includes("Success") || message.includes("Completed"))
    return <span className="text-green-400">{message}</span>;
  if (message.includes("Starting"))
    return <span className="text-yellow-100 opacity-80">{message}</span>;

  return <span>{message}</span>;
}
