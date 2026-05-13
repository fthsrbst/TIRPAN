import { useEffect, useRef, useState, useCallback } from "react";
import { buildAuthWsUrl } from "@/lib/api";

export type WSMessage = {
  type: string;
  content?: string;
  msg_id?: string;
  session_id?: string;
  [key: string]: any;
};

export function useWebSocket(_url?: string) {
  const ws = useRef<WebSocket | null>(null);
  const [ready, setReady] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  useEffect(() => {
    const demo = (() => { try { return localStorage.getItem("tirpan_demo") === "1"; } catch { return false; } })();
    if (demo) return;

    const url = buildAuthWsUrl("/ws");
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => setReady(true);
    socket.onclose = () => setReady(false);
    socket.onerror = (e) => {
      console.error("WebSocket error", e);
      setReady(false);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch {
        setLastMessage({ type: "raw", content: event.data });
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const send = useCallback((msg: WSMessage) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { ready, lastMessage, send, ws };
}
