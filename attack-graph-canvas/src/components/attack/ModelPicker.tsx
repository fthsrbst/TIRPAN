import React, { useState, useEffect, useCallback } from "react";
import { Search, X, Cpu, CheckCircle2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderConfig {
  key: string;
  label: string;
  models: string[];
  online: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderConfig[];
  onSelect: (model: string, provider: string) => void;
}

const PROVIDER_ALL = "all";

const ModelPicker: React.FC<Props> = ({ isOpen, onClose, providers, onSelect }) => {
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>(PROVIDER_ALL);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedFilter(PROVIDER_ALL);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const filteredByProvider =
    selectedFilter === PROVIDER_ALL
      ? providers
      : providers.filter((p) => p.key === selectedFilter);

  const visibleProviders = search.trim()
    ? filteredByProvider
        .map((p) => ({
          ...p,
          models: p.models.filter((m) =>
            m.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((p) => p.models.length > 0)
    : filteredByProvider;

  const totalModelCount = providers.reduce((sum, p) => sum + p.models.length, 0);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="node-card !p-0 w-[720px] max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">Select a Model</h2>
              <p className="text-[11px] text-muted-foreground">
                {totalModelCount} model{totalModelCount !== 1 ? "s" : ""} across{" "}
                {providers.length} provider{providers.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[180px] shrink-0 border-r border-border/50 p-3 flex flex-col gap-1">
            <button
              onClick={() => setSelectedFilter(PROVIDER_ALL)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                selectedFilter === PROVIDER_ALL
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center">
                <Cpu className="w-3 h-3" />
              </div>
              All Providers
              <span className="ml-auto text-[10px] text-muted-foreground">
                {totalModelCount}
              </span>
            </button>

            {providers.map((p) => (
              <button
                key={p.key}
                onClick={() => setSelectedFilter(p.key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                  selectedFilter === p.key
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    p.online ? "bg-success animate-pulse" : "bg-muted-foreground/40"
                  )}
                />
                {p.label}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {p.models.length}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">
              {visibleProviders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <Cpu className="w-7 h-7 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium">No models found</p>
                  <p className="text-[11px]">
                    Try a different search or provider filter
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleProviders.map((p) => (
                    <div key={p.key}>
                      <div className="flex items-center gap-2 mb-2 pl-1">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full",
                            p.online ? "bg-success" : "bg-muted-foreground/40"
                          )}
                        />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                          {p.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {p.models.length} {p.models.length === 1 ? "model" : "models"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {p.models.map((model) => (
                          <button
                            key={`${p.key}:${model}`}
                            onClick={() => onSelect(model, p.key)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-muted/50 group"
                          >
                            <Radio className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                            <span className="text-sm font-medium truncate">{model}</span>
                            <CheckCircle2 className="w-4 h-4 ml-auto text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelPicker;
