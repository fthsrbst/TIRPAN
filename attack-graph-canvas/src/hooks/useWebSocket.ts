import { useEffect, useRef, useState, useCallback } from "react";
import { buildAuthWsUrl } from "@/lib/api";

export type WSMessage = {
  type: string;
  content?: string;
  msg_id?: string;
  session_id?: string;
  [key: string]: any;
};

export type UseWebSocketOptions = {
  /** Her JSON mesajında çağrılır (terminal stream gibi yüksek frekanslı akışlar için). */
  onMessage?: (msg: WSMessage) => void;
};

export function useWebSocket(_url?: string, options?: UseWebSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const [ready, setReady] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const onMessageRef = useRef(options?.onMessage);
  onMessageRef.current = options?.onMessage;

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
        const data = JSON.parse(event.data) as WSMessage;
        setLastMessage(data);
        onMessageRef.current?.(data);
      } catch {
        const raw = { type: "raw", content: event.data } as WSMessage;
        setLastMessage(raw);
        onMessageRef.current?.(raw);
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
