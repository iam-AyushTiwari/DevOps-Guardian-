import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { Badge, Play, Terminal, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { socketService } from "@/lib/socket";

interface LogEntry {
  projectId: string;
  log: string;
  source: string;
  timestamp: string;
  level?: "INFO" | "WARN" | "ERROR" | "DEBUG";
}

export function LiveLogStream({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = socketService.connect();
    setIsConnected(socket.connected);

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    const handleLog = (data: LogEntry) => {
      // Filter logs specific to this project or all if generic
      if (data.projectId === projectId || projectId === "all") {
        setLogs((prev) => [...prev.slice(-99), data]); // Keep last 100 logs
      }
    };

    socket.on("log:received", handleLog);

    return () => {
      socket.off("log:received", handleLog);
      socket.off("connect");
      socket.off("disconnect");
    };
  }, [projectId]);

  // Auto-scroll logic to keep latest log in view
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const simulateIncident = async () => {
    toast.info("Initializing chaos simulation...");
    try {
      await fetch(`${API_URL}/api/v1/logs/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
          log: `[CRITICAL] Database connection pool exhausted! ECONNRESET 10.0.0.5:5432\nStack trace:\n  at Pool.connect (node_modules/pg/lib/pool.js:52)\n  at QueryService.execute (src/services/query.ts:15)`,
          source: "ProductionDB",
          service: "postgres-cluster",
          timestamp: new Date().toISOString(),
          level: "ERROR",
        }),
      });
      // Additional logs to simulate noise
      setTimeout(() => {
        setLogs((prev) => [
          ...prev,
          {
            projectId,
            log: "Transaction rollback initiated due to connection failure.",
            source: "TransactionManager",
            timestamp: new Date().toISOString(),
            level: "WARN",
          },
        ]);
      }, 500);
      toast.success("Incident Triggered!");
    } catch (e) {
      toast.error("Simulation failed");
    }
  };

  return (
    <div className="w-full bg-[#0c0c0c] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl flex flex-col h-[500px]">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 border-b border-zinc-800 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
          </div>
          <div className="h-4 w-[1px] bg-zinc-700 mx-1" />
          <div className="flex items-center gap-2 text-zinc-400">
            <Terminal className="w-3.5 h-3.5" />
            <span className="text-xs font-mono font-medium">live_stream.log</span>
          </div>
          {isConnected ? (
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] h-5 gap-1"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              CONNECTED
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] h-5"
            >
              DISCONNECTED
            </Badge>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={simulateIncident}
          className="h-7 text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
        >
          <Zap className="w-3 h-3 mr-1.5 text-yellow-500" />
          Simulate Chaos
        </Button>
      </div>

      {/* Terminal Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-black/50 text-zinc-300 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2 opacity-50">
            <Terminal className="w-8 h-8 mb-2" />
            <p>Waiting for incoming telemetry...</p>
            <p className="text-[10px]">Listening on wss://api.devops-guardian.com/v1/stream</p>
          </div>
        )}

        {logs.map((entry, i) => (
          <div
            key={i}
            className="group flex items-start gap-3 hover:bg-zinc-900/30 -mx-4 px-4 py-0.5 transition-colors"
          >
            {/* Timestamp */}
            <span className="text-zinc-600 shrink-0 select-none min-w-[80px]">
              {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                fractionalSecondDigits: 3,
              })}
            </span>

            {/* Level */}
            <span
              className={`shrink-0 font-bold w-12 uppercase text-[10px] pt-[1px]
                  ${
                    entry.level === "ERROR" ||
                    entry.log.includes("ERROR") ||
                    entry.log.includes("FATAL")
                      ? "text-red-500"
                      : entry.level === "WARN"
                        ? "text-yellow-500"
                        : "text-blue-500"
                  }
              `}
            >
              {entry.level || "INFO"}
            </span>

            {/* Source */}
            <span
              className="text-zinc-500 shrink-0 select-none w-24 truncate hidden sm:block text-right"
              title={entry.source}
            >
              [{entry.source}]
            </span>

            {/* Message */}
            <span
              className={`flex-1 break-all whitespace-pre-wrap
                  ${
                    entry.level === "ERROR" ||
                    entry.log.includes("ERROR") ||
                    entry.log.includes("FATAL")
                      ? "text-red-400"
                      : "text-zinc-300 group-hover:text-zinc-100"
                  }
              `}
            >
              {entry.log}
            </span>
          </div>
        ))}

        {/* Blinking Cursor */}
        <div className="h-4 w-2 bg-zinc-500 animate-pulse mt-1 ml-[215px]" />
      </div>
    </div>
  );
}
