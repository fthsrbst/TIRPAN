import { useState, useRef, useEffect } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Terminal, Play, Square, Send } from "lucide-react";

const TerminalPage = () => {
  const [terminalId, setTerminalId] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { ready, lastMessage, send } = useWebSocket();

  useEffect(() => {
    if (!lastMessage) return;
    switch (lastMessage.type) {
      case "terminal_opened":
        setTerminalId(lastMessage.terminal_id || "");
        setIsOpen(true);
        setOutput((prev) => prev + `\r\n[Terminal açıldı: ${lastMessage.terminal_id}]\r\n`);
        break;
      case "terminal_output":
        if (lastMessage.terminal_id === terminalId || !terminalId) {
          setOutput((prev) => prev + (lastMessage.data || ""));
        }
        break;
      case "terminal_exit":
        if (lastMessage.terminal_id === terminalId) {
          setOutput((prev) => prev + `\r\n[Terminal kapandı]\r\n`);
          setIsOpen(false);
          setTerminalId("");
        }
        break;
      case "terminal_error":
        setOutput((prev) => prev + `\r\n[Hata: ${lastMessage.message}]\r\n`);
        break;
      case "terminal_closed":
        setIsOpen(false);
        setTerminalId("");
        break;
    }
  }, [lastMessage, terminalId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  const openTerminal = () => {
    if (!ready) return;
    send({ type: "terminal_open", session_id: "operator-local", shell: "/bin/bash", rows: 30, cols: 120 });
  };

  const closeTerminal = () => {
    if (terminalId && ready) {
      send({ type: "terminal_close", terminal_id: terminalId });
    }
    setIsOpen(false);
    setTerminalId("");
    setOutput("");
  };

  const submitInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !terminalId || !ready) return;
    send({ type: "terminal_input", terminal_id: terminalId, data: input + "\n" });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (terminalId && ready) {
        send({ type: "terminal_input", terminal_id: terminalId, data: "\t" });
      }
    }
  };

  return (
    <PageShell title="Terminal" subtitle="Native PTY terminal — bağımsız bash kabuğu">
      <div className="flex flex-col h-full gap-3">
        <div className="flex items-center gap-3 shrink-0 node-card !p-3">
          {!isOpen ? (
            <button onClick={openTerminal} disabled={!ready} className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40">
              <Play className="w-3.5 h-3.5" /> Terminal Aç
            </button>
          ) : (
            <button onClick={closeTerminal} className="flex items-center gap-2 px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90">
              <Square className="w-3.5 h-3.5" /> Kapat
            </button>
          )}
          <div className="ml-auto text-[10px] text-muted-foreground flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isOpen ? "bg-success animate-pulse" : ready ? "bg-accent" : "bg-destructive"}`} />
            {isOpen ? "Terminal Açık" : ready ? "Hazır" : "Bağlanıyor..."}
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-[#0a0a0a] text-[#e0e0e0] dark:bg-[#050505] dark:text-[#d0d0d0] rounded-3xl border border-border/50 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 shrink-0">
            <span className="w-3 h-3 rounded-full bg-destructive" />
            <span className="w-3 h-3 rounded-full bg-warning" />
            <span className="w-3 h-3 rounded-full bg-success" />
            <span className="ml-3 text-xs font-mono opacity-70">
              {terminalId ? `pty@${terminalId.slice(0, 12)}` : "pentest@tirpan — bash"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {output || (
              <span className="opacity-50">
                {"Terminal Aç"} butonuna basarak bağımsız bir bash kabuğu başlatın.{"\n"}
                Herhangi bir mission seçimine gerek yok.{"\n"}
              </span>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={submitInput} className="flex items-center gap-2 px-5 py-3 border-t border-white/10 font-mono text-xs shrink-0">
            <span className="text-accent">$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isOpen ? "komut girin..." : "Terminal kapalı — Terminal Aç butonuna basın"}
              className="flex-1 bg-transparent outline-none placeholder:text-white/30"
              disabled={!isOpen}
              autoFocus
              autoComplete="off"
            />
            <button type="submit" disabled={!isOpen || !input} className="text-accent hover:text-white disabled:opacity-30">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </PageShell>
  );
};

export default TerminalPage;
