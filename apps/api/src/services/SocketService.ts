import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

export class SocketService {
  private static instance: SocketService;
  private io: Server | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public initialize(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: [process.env.FRONTEND_URL || "http://localhost:3002"],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.io.on("connection", (socket: Socket) => {
      console.log(`[Socket] Client connected: ${socket.id}`);

      socket.on("disconnect", () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });

    console.log("[Socket] Service initialized and listening for connections.");
  }

  /**
   * Broadcast an event to all connected clients
   */
  public emit(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
      // console.log(`[Socket] Broadcast event: ${event}`);
    } else {
      console.warn("[Socket] Attempted to emit event before initialization");
    }
  }

  /**
   * Emit log line to specific project room
   */
  public emitLog(
    projectId: string,
    log: string,
    level: string = "INFO",
    source: string = "System",
    incidentId?: string,
  ) {
    this.emit("log:received", {
      projectId,
      incidentId,
      log,
      level,
      source,
      timestamp: new Date(),
    });
  }

  public emitIncidentUpdate(incident: any) {
    this.emit("incident:update", incident);
  }

  public emitAgentRun(incidentId: string, agentRun: any) {
    this.emit("agent:run", { incidentId, agentRun });
  }
}
