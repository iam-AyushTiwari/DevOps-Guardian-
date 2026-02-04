import { io, Socket } from "socket.io-client";
import { API_URL } from "@/lib/config";

// In production, this URL should come from env

class SocketService {
  private socket: Socket | null = null;

  public connect() {
    if (!this.socket) {
      this.socket = io(API_URL);
      console.log("[Client] Socket connecting...");

      this.socket.on("connect", () => {
        console.log("[Client] Connected to socket server:", this.socket?.id);
      });

      this.socket.on("disconnect", () => {
        console.log("[Client] Disconnected");
      });
    }
    return this.socket;
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
