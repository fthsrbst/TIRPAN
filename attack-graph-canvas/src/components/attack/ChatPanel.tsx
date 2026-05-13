import { useState, useRef, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MessageSquare, Send, Bot, User, Square } from "lucide-react";
import { ModelSelector } from "@/components/attack/TopTabs";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

export const ChatPanel = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: "AI Agent connected. Ask me about your pentest missions.", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState("ollama");
  const [activeModel, setActiveModel] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef("");
  // Ref mirrors isStreaming so effects don't need it as a dependency
  const isStreamingRef = useRef(false);

  const { ready, lastMessage, send } = useWebSocket(WS_URL);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "token") {
      if (!isStreamingRef.current) return;
      streamingRef.current += lastMessage.content || "";
      setStreaming(streamingRef.current);
    } else if (lastMessage.type === "message_end") {
      const finalContent = streamingRef.current;
      streamingRef.current = "";
      isStreamingRef.current = false;
      setStreaming("");
      setIsStreaming(false);
      if (finalContent.trim()) {
        setMessages((prev) => [...prev, { role: "assistant", content: finalContent, ts: Date.now() }]);
      }
    } else if (lastMessage.type === "error") {
      streamingRef.current = "";
      isStreamingRef.current = false;
      setStreaming("");
      setIsStreaming(false);
      setMessages((prev) => [...prev, { role: "system", content: `Error: ${lastMessage.content}`, ts: Date.now() }]);
    }
  }, [lastMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !ready || isStreamingRef.current) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim(), ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    isStreamingRef.current = true;
    setIsStreaming(true);
    streamingRef.current = "";
    setStreaming("");
    send({
      type: "chat",
      content: input.trim(),
      provider: activeProvider,
      ...(activeModel ? { model: activeModel } : {}),
    });
    setInput("");
  };

  return (
    <div className="w-[320px] shrink-0 h-full flex flex-col gap-3">
      {/* Header */}
      <div className="node-card !p-3 flex items-center gap-2 shrink-0">
        <MessageSquare className="w-4 h-4 text-accent" />
        <span className="font-display font-bold text-sm">AI Chat</span>
        <div className="ml-auto flex items-center gap-2">
          <ModelSelector
            onModelChange={(prov, mod) => {
              setActiveProvider(prov);
              setActiveModel(mod);
            }}
          />
          <span className={`w-2 h-2 rounded-full shrink-0 ${ready ? "bg-success animate-pulse" : "bg-destructive"}`} />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 text-xs pr-1">
        {messages.map((m, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${m.role === "user" ? "bg-accent/15 text-accent" : m.role === "system" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
              {m.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
            </div>
            <div className={`flex-1 p-2.5 rounded-xl ${m.role === "user" ? "bg-accent/10 text-foreground" : "bg-muted/50 text-foreground"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3 h-3" />
            </div>
            <div className="flex-1 p-2.5 rounded-xl bg-muted/50 text-foreground">
              {streaming || <span className="text-muted-foreground animate-pulse">...</span>}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 shrink-0 node-card !p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ready ? (isStreaming ? "Responding..." : "Ask AI...") : "Connecting..."}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none px-2 py-1"
          disabled={!ready || isStreaming}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={() => {
              send({ type: "abort" });
              streamingRef.current = "";
              isStreamingRef.current = false;
              setStreaming("");
              setIsStreaming(false);
            }}
            className="w-7 h-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 animate-pulse"
            title="Durdur"
          >
            <Square className="w-3 h-3 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!ready || !input.trim()}
            className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90"
          >
            <Send className="w-3 h-3" />
          </button>
        )}
      </form>
    </div>
  );
};

export default ChatPanel;
