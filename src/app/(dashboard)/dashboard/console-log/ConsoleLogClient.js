"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { cn } from "@/shared/utils/cn";

const LOG_LEVEL_COLORS = {
  LOG: "text-green-400",
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-purple-400",
};

function colorLine(line) {
  const match = line.match(/\[(\w+)\]/g);
  const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
  const color = LOG_LEVEL_COLORS[levelTag] || "text-green-400";
  return <span className={color}>{line}</span>;
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const logRef = useRef(null);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "init") {
          setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
        } else if (msg.type === "line") {
          setLogs((prev) => {
            const next = [...prev, msg.line];
            return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
          });
        } else if (msg.type === "clear") {
          setLogs([]);
        }
      } catch (err) {
        console.warn("Failed to parse SSE message:", err);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="w-full">
      <div className="relative rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)] dark:shadow-[0_0_50px_-12px_rgba(168,85,247,0.3)] bg-white dark:bg-[#0d0d12] backdrop-blur-xl transition-all duration-300">
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/5 dark:bg-[#16161e] border-b border-black/5 dark:border-white/5">
          {/* Mac OS Traffic Lights */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-[0_0_10px_rgba(255,95,86,0.3)] dark:shadow-[0_0_10px_rgba(255,95,86,0.5)]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-[0_0_10px_rgba(255,189,46,0.3)] dark:shadow-[0_0_10px_rgba(255,189,46,0.5)]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-[0_0_10px_rgba(39,201,63,0.3)] dark:shadow-[0_0_10px_rgba(39,201,63,0.5)]"></div>
          </div>
          
          {/* Center Title */}
          <div className="text-xs font-mono text-text-muted absolute left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-70">
            <span className="material-symbols-outlined text-[14px]">terminal</span>
            nexus-gateway ~ /logs
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-[10px] text-text-main font-semibold uppercase tracking-wider">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full animate-pulse", 
                  connected 
                    ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] dark:shadow-[0_0_8px_rgba(34,197,94,0.8)]" 
                    : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] dark:shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                )}></span>
                {connected ? "LIVE" : "OFFLINE"}
             </div>
             <button 
               onClick={handleClear}
               className="text-text-muted hover:text-text-main transition-all flex items-center justify-center hover:rotate-12 hover:scale-110"
               title="Clear Logs"
             >
               <span className="material-symbols-outlined text-[16px]">mop</span>
             </button>
          </div>
        </div>
        
        {/* Terminal Body */}
        <div
          ref={logRef}
          className="p-5 text-xs font-mono h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10 bg-[#fafafa] dark:bg-transparent"
        >
          {logs.length === 0 ? (
            <div className="text-text-muted flex items-center justify-center h-full opacity-50">
              <span className="animate-pulse flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
                Waiting for incoming signals...
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((line, i) => (
                <div key={i} className="leading-relaxed hover:bg-black/[0.03] dark:hover:bg-white/[0.03] px-2 py-0.5 -mx-2 rounded transition-colors duration-150">
                    {colorLine(line)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
