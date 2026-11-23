export type LogType = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: LogType;
}

const handlers: Array<(entry: LogEntry) => void> = [];

export function addLog(message: string, type: LogType = "info") {
  const entry: LogEntry = {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date(),
    message,
    type,
  };
  handlers.forEach((fn) => fn(entry));
}

export function subscribeToLogs(fn: (entry: LogEntry) => void): () => void {
  handlers.push(fn);
  return () => {
    const idx = handlers.indexOf(fn);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}
