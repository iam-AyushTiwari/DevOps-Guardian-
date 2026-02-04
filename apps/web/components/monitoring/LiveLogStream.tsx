import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { Badge, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { socketService } from "@/lib/socket";

// ... previous code

export function LiveLogStream({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ... (socket logic remains same)
    const socket = socketService.connect();
    const handleLog = (data: any) => {
      if (data.projectId === projectId || projectId === "all") {
        setLogs((prev) => [...prev.slice(-49), data]);
      }
    };
    socket.on("log:received", handleLog);
    return () => {
      socket.off("log:received", handleLog);
    };
  }, [projectId]);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const simulateIncident = async () => {
    toast.info("Simulating production failure...");
    try {
      // Send a mock "Database Connection Lost" log
      await fetch(`${API_URL}/webhook/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
          log: `[FATAL] Database connection lost! ECONNREFUSED 10.0.0.5:5432\nStack trace:\n  at Client.connect (node_modules/pg/lib/client.js:52)\n  at ConnectionParameters.getLibPqConnectionString`,
          source: "ProductionDB",
          timestamp: new Date().toISOString(),
        }),
      });
      toast.success("Incident Triggered!");
    } catch (e) {
      toast.error("Simulation failed");
    }
  };

  return (
    <Card className="h-[400px] flex flex-col bg-slate-950 border-slate-800">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-sm font-mono text-slate-400">Live Log Stream</CardTitle>
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-500 border-green-500/20 text-xs animate-pulse"
            >
              LIVE
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={simulateIncident}
            className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/50"
          >
            <Play className="w-3 h-3 mr-1.5" /> Simulate Incident
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden relative">
        <div className="absolute inset-0 p-4 overflow-y-auto font-mono text-xs" ref={scrollRef}>
          <div className="space-y-1">
            {logs.length === 0 && (
              <div className="text-slate-600 italic">Waiting for incoming logs...</div>
            )}
            {logs.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-500 shrink-0 select-none">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`${
                    entry.log.toLowerCase().includes("error") ? "text-red-400" : "text-slate-300"
                  } break-all whitespace-pre-wrap`}
                >
                  {entry.log}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
