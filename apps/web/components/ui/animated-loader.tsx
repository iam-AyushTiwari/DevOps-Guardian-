import { cn } from "@/lib/utils";

interface AnimatedLoaderProps {
  className?: string;
  variant?: "wave" | "pulse" | "scan" | "dots";
}

export function AnimatedLoader({ className, variant = "wave" }: AnimatedLoaderProps) {
  if (variant === "wave") {
    return (
      <div className={cn("flex items-end gap-1 h-3", className)}>
        <div className="w-1 h-2 bg-purple-500 rounded-full animate-[bounce_1s_infinite] [animation-delay:-0.3s]" />
        <div className="w-1 h-3 bg-purple-500 rounded-full animate-[bounce_1s_infinite] [animation-delay:-0.15s]" />
        <div className="w-1 h-2 bg-purple-500 rounded-full animate-[bounce_1s_infinite]" />
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className={cn("relative flex h-3 w-3", className)}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
      </div>
    );
  }

  if (variant === "scan") {
    return (
      <div className={cn("relative h-1 w-24 overflow-hidden bg-zinc-800 rounded", className)}>
        <div
          className="absolute inset-y-0 left-0 w-1/3 bg-purple-500 animate-[shimmer_1.5s_infinite_linear]"
          style={{
            backgroundImage: "linear-gradient(90deg, transparent, #a855f7, transparent)",
          }}
        />
        <style jsx>{`
          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(300%);
            }
          }
        `}</style>
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className={cn("flex space-x-1", className)}>
        <div className="w-1 h-1 bg-zinc-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
        <div className="w-1 h-1 bg-zinc-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
        <div className="w-1 h-1 bg-zinc-500 rounded-full animate-pulse"></div>
      </div>
    );
  }

  return null;
}
