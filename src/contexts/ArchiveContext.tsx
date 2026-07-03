import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useWebSocket } from './WebSocketContext';

type ArchiveContextType = {
  archiveSession: (sessionId: string) => void;
  unarchiveSession: (sessionId: string) => void;
  archiveSessionsBulk: (sessionIds: string[]) => void;
  isSessionArchived: (sessionId: string) => boolean;
  getProjectArchivedCount: (sessionIds: string[]) => number;
};

const ArchiveContext = createContext<ArchiveContextType | null>(null);

export function useArchive(): ArchiveContextType {
  const ctx = useContext(ArchiveContext);
  if (!ctx) throw new Error('useArchive must be used within ArchiveProvider');
  return ctx;
}

export function ArchiveProvider({ children }: { children: React.ReactNode }) {
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const { latestMessage } = useWebSocket();

  // Load archived sessions from server on mount
  useEffect(() => {
    fetch('/api/sessions/archived')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.sessionIds)) {
          setArchived(new Set(data.sessionIds));
        }
      })
      .catch(() => {});
  }, []);

  // Auto-unarchive when a session gets new activity via WebSocket
  useEffect(() => {
    if (!latestMessage) return;
    if (
      latestMessage.type === 'session-lifecycle' &&
      (latestMessage.status === 'completed' || latestMessage.status === 'error')
    ) {
      const sessionId = latestMessage.sessionId as string;
      if (!sessionId) return;
      setArchived((prev) => {
        if (!prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, [latestMessage]);

  const archiveSession = useCallback((sessionId: string) => {
    setArchived((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    }).catch(() => {
      setArchived((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    });
  }, []);

  const unarchiveSession = useCallback((sessionId: string) => {
    setArchived((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    }).catch(() => {
      setArchived((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
    });
  }, []);

  const archiveSessionsBulk = useCallback((sessionIds: string[]) => {
    if (!sessionIds.length) return;
    setArchived((prev) => {
      const next = new Set(prev);
      for (const id of sessionIds) next.add(id);
      return next;
    });
    fetch('/api/sessions/archive-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds }),
    }).catch(() => {
      setArchived((prev) => {
        const next = new Set(prev);
        for (const id of sessionIds) next.delete(id);
        return next;
      });
    });
  }, []);

  const isSessionArchived = useCallback(
    (sessionId: string) => archived.has(sessionId),
    [archived],
  );

  const getProjectArchivedCount = useCallback(
    (sessionIds: string[]) => sessionIds.filter((id) => archived.has(id)).length,
    [archived],
  );

  const value = useMemo(
    () => ({ archiveSession, unarchiveSession, archiveSessionsBulk, isSessionArchived, getProjectArchivedCount }),
    [archiveSession, unarchiveSession, archiveSessionsBulk, isSessionArchived, getProjectArchivedCount],
  );

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}
