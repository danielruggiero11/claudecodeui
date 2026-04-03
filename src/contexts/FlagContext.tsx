import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type FlagContextType = {
  flagSession: (sessionId: string) => void;
  unflagSession: (sessionId: string) => void;
  isSessionFlagged: (sessionId: string) => boolean;
  getProjectFlagCount: (sessionIds: string[]) => number;
};

const FlagContext = createContext<FlagContextType | null>(null);

export function useFlag(): FlagContextType {
  const ctx = useContext(FlagContext);
  if (!ctx) throw new Error('useFlag must be used within FlagProvider');
  return ctx;
}

export function FlagProvider({ children }: { children: React.ReactNode }) {
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  // Load flagged sessions from server on mount
  useEffect(() => {
    fetch('/api/sessions/flagged')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.sessionIds)) {
          setFlagged(new Set(data.sessionIds));
        }
      })
      .catch(() => {
        // best-effort; state remains empty
      });
  }, []);

  const flagSession = useCallback((sessionId: string) => {
    setFlagged((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/flag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagged: true }),
    }).catch(() => {
      // Revert optimistic update on failure
      setFlagged((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    });
  }, []);

  const unflagSession = useCallback((sessionId: string) => {
    setFlagged((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/flag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagged: false }),
    }).catch(() => {
      // Revert optimistic update on failure
      setFlagged((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
    });
  }, []);

  const isSessionFlagged = useCallback(
    (sessionId: string) => flagged.has(sessionId),
    [flagged],
  );

  const getProjectFlagCount = useCallback(
    (sessionIds: string[]) => sessionIds.filter((id) => flagged.has(id)).length,
    [flagged],
  );

  const value = useMemo(
    () => ({ flagSession, unflagSession, isSessionFlagged, getProjectFlagCount }),
    [flagSession, unflagSession, isSessionFlagged, getProjectFlagCount],
  );

  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>;
}
