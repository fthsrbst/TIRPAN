import { createContext, useContext, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/lib/api";

interface SessionContextType {
  selectedSessionId: string | null;
  setSelectedSessionId: (sid: string | null) => void;
  selectedSession: any | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextType>({
  selectedSessionId: null,
  setSelectedSessionId: () => {},
  selectedSession: null,
  isLoading: false,
});

export const useSessionContext = () => useContext(SessionContext);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: selectedSession = null, isLoading } = useQuery({
    /* Same cache key / refetch rhythm as useSessionBundle(["session-detail", id])
       so UI that depends on ctxSession stays in sync with Attack Graph polls. */
    queryKey: ["session-detail", selectedSessionId],
    queryFn: () => getSession(selectedSessionId!),
    enabled: !!selectedSessionId,
    refetchInterval: (query) => {
      const d = query.state.data as any;
      if (!d) return false;
      return d.status === "running" || d.is_running ? 4000 : false;
    },
  });

  return (
    <SessionContext.Provider value={{ selectedSessionId, setSelectedSessionId, selectedSession, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
};
