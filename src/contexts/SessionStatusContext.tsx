import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from './WebSocketContext';
import type { SessionLiveStatus, ProjectLiveStatus } from '../components/sidebar/types/types';

// ── Types ─────────────────────────────────────────────────────────────

type SessionStatusEntry = {
  status: SessionLiveStatus;
  provider: string;
  lastActiveAt: number;
};

type SessionStatusMap = Record<string, SessionStatusEntry>;

type SessionStatusContextType = {
  statusMap: SessionStatusMap;
  markSessionSeen: (sessionId: string) => void;
  getProjectStatus: (sessionIds: string[]) => ProjectLiveStatus;
  getSessionLiveStatus: (sessionId: string) => SessionLiveStatus;
};

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Context ───────────────────────────────────────────────────────────

const SessionStatusContext = createContext<SessionStatusContextType | null>(null);

export function useSessionStatus(): SessionStatusContextType {
  const ctx = useContext(SessionStatusContext);
  if (!ctx) {
    throw new Error('useSessionStatus must be used within SessionStatusProvider');
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────

export function SessionStatusProvider({ children }: { children: React.ReactNode }) {
  const { sendMessage, latestMessage, isConnected } = useWebSocket();
  const [statusMap, setStatusMap] = useState<SessionStatusMap>({});

  const previouslyActiveRef = useRef<Set<string>>(new Set());
  const lastSeenRef = useRef<Record<string, number>>({});
  const statusMapRef = useRef<SessionStatusMap>(statusMap);
  const responseReadyRef = useRef<Record<string, { provider: string; lastActiveAt: number }>>({});

  // Keep ref in sync
  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);

  // Load initial state from server
  useEffect(() => {
    fetch('/api/sessions/read-status')
      .then((r) => r.json())
      .then((data: { lastSeen?: Record<string, number>; responseReady?: Record<string, { provider: string; lastActiveAt: number }> }) => {
        if (data.lastSeen) {
          lastSeenRef.current = data.lastSeen;
        }
        if (data.responseReady) {
          const now = Date.now();
          const map: SessionStatusMap = {};
          for (const [id, entry] of Object.entries(data.responseReady)) {
            if (now - entry.lastActiveAt < TTL_MS) {
              map[id] = { status: 'response-ready', provider: entry.provider, lastActiveAt: entry.lastActiveAt };
              responseReadyRef.current[id] = entry;
            }
          }
          setStatusMap(map);
        }
      })
      .catch(() => {
        // best-effort; state remains empty
      });
  }, []);

  // Poll active sessions
  useEffect(() => {
    if (!isConnected) return;

    sendMessage({ type: 'get-active-sessions' });

    const hasActiveEntries = Object.values(statusMapRef.current).some(e => e.status === 'responding');
    const interval = setInterval(() => {
      sendMessage({ type: 'get-active-sessions' });
    }, hasActiveEntries ? 3000 : 10000);

    return () => clearInterval(interval);
  }, [isConnected, sendMessage]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!latestMessage) return;

    if (latestMessage.type === 'active-sessions') {
      const sessions = latestMessage.sessions as Record<string, string[]>;
      const nowActive = new Set<string>();
      const nextMap: SessionStatusMap = {};

      for (const [provider, ids] of Object.entries(sessions)) {
        const idList = Array.isArray(ids)
          ? ids.map((item: string | { id?: string }) =>
              typeof item === 'string' ? item : item?.id
            ).filter(Boolean) as string[]
          : [];
        for (const id of idList) {
          nowActive.add(id);
          nextMap[id] = { status: 'responding', provider, lastActiveAt: Date.now() };
        }
      }

      // Sessions that were active but aren't now → check if response-ready
      for (const prevId of previouslyActiveRef.current) {
        if (!nowActive.has(prevId)) {
          const lastSeen = lastSeenRef.current[prevId] || 0;
          const prev = statusMapRef.current[prevId];
          const lastActive = prev?.lastActiveAt || Date.now();
          if (lastActive > lastSeen) {
            nextMap[prevId] = { status: 'response-ready', provider: prev?.provider || 'claude', lastActiveAt: lastActive };
            responseReadyRef.current[prevId] = { provider: prev?.provider || 'claude', lastActiveAt: lastActive };
          }
        }
      }

      // Preserve existing response-ready entries that aren't now active
      for (const [id, entry] of Object.entries(statusMapRef.current)) {
        if (entry.status === 'response-ready' && !nowActive.has(id) && !nextMap[id]) {
          if (Date.now() - entry.lastActiveAt < TTL_MS) {
            nextMap[id] = entry;
          }
        }
      }

      previouslyActiveRef.current = nowActive;
      setStatusMap(nextMap);
    }

    if (latestMessage.type === 'session-lifecycle') {
      const { sessionId, provider, status } = latestMessage as {
        sessionId: string;
        provider: string;
        status: 'active' | 'completed' | 'error';
      };

      setStatusMap(prev => {
        const next = { ...prev };
        if (status === 'active') {
          next[sessionId] = { status: 'responding', provider, lastActiveAt: Date.now() };
        } else {
          const lastSeen = lastSeenRef.current[sessionId] || 0;
          const lastActive = prev[sessionId]?.lastActiveAt || Date.now();
          if (lastActive > lastSeen) {
            next[sessionId] = { status: 'response-ready', provider, lastActiveAt: lastActive };
            responseReadyRef.current[sessionId] = { provider, lastActiveAt: lastActive };
          } else {
            delete next[sessionId];
            delete responseReadyRef.current[sessionId];
          }
        }
        return next;
      });
    }

    if (latestMessage.type === 'websocket-reconnected') {
      sendMessage({ type: 'get-active-sessions' });
    }
  }, [latestMessage, sendMessage]);

  // Periodic cleanup of stale response-ready entries (every 5 min)
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of Object.entries(responseReadyRef.current)) {
        if (now - entry.lastActiveAt > TTL_MS) {
          delete responseReadyRef.current[id];
        }
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(cleanup);
  }, []);

  const markSessionSeen = useCallback((sessionId: string) => {
    const now = Date.now();
    lastSeenRef.current[sessionId] = now;
    delete responseReadyRef.current[sessionId];

    setStatusMap(prev => {
      const entry = prev[sessionId];
      if (!entry || entry.status !== 'response-ready') return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });

    // Persist to server (fire-and-forget)
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/seen`, {
      method: 'PUT',
    }).catch(() => {});
  }, []);

  const getProjectStatus = useCallback((sessionIds: string[]): ProjectLiveStatus => {
    let respondingCount = 0;
    let responseReadyCount = 0;
    for (const id of sessionIds) {
      const entry = statusMapRef.current[id];
      if (entry?.status === 'responding') respondingCount++;
      if (entry?.status === 'response-ready') responseReadyCount++;
    }
    return { respondingCount, responseReadyCount };
  }, []);

  const getSessionLiveStatus = useCallback((sessionId: string): SessionLiveStatus => {
    return statusMapRef.current[sessionId]?.status || 'idle';
  }, []);

  const value = useMemo(() => ({
    statusMap,
    markSessionSeen,
    getProjectStatus,
    getSessionLiveStatus,
  }), [statusMap, markSessionSeen, getProjectStatus, getSessionLiveStatus]);

  return (
    <SessionStatusContext.Provider value={value}>
      {children}
    </SessionStatusContext.Provider>
  );
}
