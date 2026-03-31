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

// ── localStorage helpers ──────────────────────────────────────────────

const LAST_SEEN_KEY = 'session-last-seen';
const RESPONSE_READY_KEY = 'session-response-ready';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadLastSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistLastSeen(data: Record<string, number>) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(data));
  } catch {
    // best-effort
  }
}

function loadResponseReady(): Record<string, { provider: string; lastActiveAt: number }> {
  try {
    const raw = localStorage.getItem(RESPONSE_READY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistResponseReady(data: Record<string, { provider: string; lastActiveAt: number }>) {
  try {
    localStorage.setItem(RESPONSE_READY_KEY, JSON.stringify(data));
  } catch {
    // best-effort
  }
}

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
  const [statusMap, setStatusMap] = useState<SessionStatusMap>(() => {
    // Restore response-ready entries from localStorage
    const saved = loadResponseReady();
    const now = Date.now();
    const map: SessionStatusMap = {};
    for (const [id, entry] of Object.entries(saved)) {
      if (now - entry.lastActiveAt < TTL_MS) {
        map[id] = { status: 'response-ready', provider: entry.provider, lastActiveAt: entry.lastActiveAt };
      }
    }
    return map;
  });

  const previouslyActiveRef = useRef<Set<string>>(new Set());
  const lastSeenRef = useRef<Record<string, number>>(loadLastSeen());
  const statusMapRef = useRef<SessionStatusMap>(statusMap);
  const responseReadyRef = useRef(loadResponseReady());

  // Keep ref in sync
  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);

  // Poll active sessions
  useEffect(() => {
    if (!isConnected) return;

    // Initial poll immediately
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

      // Mark all currently active sessions as responding
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
      persistResponseReady(responseReadyRef.current);
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
          // completed or error
          const lastSeen = lastSeenRef.current[sessionId] || 0;
          const lastActive = prev[sessionId]?.lastActiveAt || Date.now();
          if (lastActive > lastSeen) {
            next[sessionId] = { status: 'response-ready', provider, lastActiveAt: lastActive };
            responseReadyRef.current[sessionId] = { provider, lastActiveAt: lastActive };
            persistResponseReady(responseReadyRef.current);
          } else {
            delete next[sessionId];
            delete responseReadyRef.current[sessionId];
            persistResponseReady(responseReadyRef.current);
          }
        }
        return next;
      });
    }

    // On reconnect, re-poll immediately
    if (latestMessage.type === 'websocket-reconnected') {
      sendMessage({ type: 'get-active-sessions' });
    }
  }, [latestMessage, sendMessage]);

  // Periodic cleanup of stale last-seen entries (every 5 min)
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      let changed = false;
      for (const [id, ts] of Object.entries(lastSeenRef.current)) {
        if (now - ts > maxAge) {
          delete lastSeenRef.current[id];
          changed = true;
        }
      }
      if (changed) persistLastSeen(lastSeenRef.current);

      // Clean stale response-ready
      for (const [id, entry] of Object.entries(responseReadyRef.current)) {
        if (now - entry.lastActiveAt > TTL_MS) {
          delete responseReadyRef.current[id];
        }
      }
      persistResponseReady(responseReadyRef.current);
    }, 5 * 60 * 1000);
    return () => clearInterval(cleanup);
  }, []);

  const markSessionSeen = useCallback((sessionId: string) => {
    lastSeenRef.current[sessionId] = Date.now();
    persistLastSeen(lastSeenRef.current);

    // Remove response-ready entry
    delete responseReadyRef.current[sessionId];
    persistResponseReady(responseReadyRef.current);

    setStatusMap(prev => {
      const entry = prev[sessionId];
      if (!entry || entry.status !== 'response-ready') return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
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
