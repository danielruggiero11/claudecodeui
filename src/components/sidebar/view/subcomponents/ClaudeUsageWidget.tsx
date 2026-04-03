import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, DollarSign, RefreshCw, ShieldAlert, LogIn } from 'lucide-react';
import { useWebSocket } from '../../../../contexts/WebSocketContext';
import { authenticatedFetch } from '../../../../utils/api';

type UsageData = {
  spent: string | null;
  total: string | null;
  reset: string | null;
  error: string | null;
  errorType: 'cloudflare' | 'auth' | 'generic' | null;
  lastUpdated: string | null;
};

type UsageResponse = {
  enabled: boolean;
  data: UsageData | null;
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function parseAmount(val: string | null): number {
  if (!val) return 0;
  return parseFloat(val.replace(/,/g, '')) || 0;
}

/** Returns how far through the current billing cycle we are (0–1), at hourly granularity.
 *  Cycle always resets on the 1st of the month at midnight. */
function calcCyclePct(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const totalHours = daysInMonth * 24;
  // Hours elapsed since the 1st at midnight
  const hoursElapsed = (now.getDate() - 1) * 24 + now.getHours() + now.getMinutes() / 60;
  return hoursElapsed / totalHours;
}

export default function ClaudeUsageWidget() {
  const { latestMessage } = useWebSocket();
  const [data, setData] = useState<UsageData | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(async (force = false) => {
    try {
      const endpoint = force ? '/api/claude-usage/refresh' : '/api/claude-usage';
      const method = force ? 'POST' : 'GET';
      const res = await authenticatedFetch(endpoint, { method });
      if (!res.ok) return;
      const json: UsageResponse = await res.json();
      setEnabled(json.enabled);
      if (json.data) setData(json.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  useEffect(() => {
    if (latestMessage?.type === 'claude_usage_update' && latestMessage.data) {
      setEnabled(true);
      setData(latestMessage.data);
    }
  }, [latestMessage]);

  // Tick relative time every 30s
  useEffect(() => {
    timerRef.current = setInterval(() => forceUpdate(n => n + 1), 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsage(true);
    setRefreshing(false);
  }, [fetchUsage]);

  if (!enabled) return null;

  const spent = parseAmount(data?.spent ?? null);
  const total = parseAmount(data?.total ?? null);
  const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;

  // Pace calculation
  const cyclePct = calcCyclePct();
  const expectedSpend = total * cyclePct;
  const gap = expectedSpend - spent; // positive = under pace (good), negative = over pace (bad)
  const pacePct = Math.min(cyclePct * 100, 100);
  const showPace = total > 0;

  const barColor =
    pct >= 90 ? 'bg-red-500' :
    pct >= 75 ? 'bg-yellow-500' :
    'bg-green-500';

  const textColor =
    pct >= 90 ? 'text-red-500' :
    pct >= 75 ? 'text-yellow-500' :
    'text-green-500';

  const paceColor = gap >= 0 ? 'text-green-500' : 'text-red-500';
  const paceArrow = gap >= 0 ? '▲' : '▼';
  const paceAmt = `$${Math.abs(gap).toFixed(0)}`;

  // Format reset date with abbreviated month (e.g. "Resets Dec 1")
  const resetLabel = (() => {
    if (!data?.reset) return null;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(data.reset);
    if (isNaN(d.getTime())) return data.reset; // fallback to raw string
    return `Resets ${months[d.getMonth()]} ${d.getDate()}`;
  })();

  return (
    <div className="px-2 pb-1.5">
      <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Claude Usage</span>
          </div>
          <div className="flex items-center gap-1.5">
            {data?.lastUpdated && (
              <span className="text-[10px] text-muted-foreground/60">
                {formatRelativeTime(data.lastUpdated)}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error state */}
        {data?.error && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5">
            {data.errorType === 'auth' && <LogIn className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />}
            {data.errorType === 'cloudflare' && <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-orange-500" />}
            {data.errorType === 'generic' && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-yellow-500" />}
            <span className="text-[10px] leading-tight text-muted-foreground">{data.error}</span>
          </div>
        )}

        {/* Progress bar with pace marker */}
        {total > 0 && (
          <div className="relative mb-2 py-1">
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {showPace && (
              <div
                className="absolute top-0 h-3.5 w-0.5 rounded-full bg-foreground/30"
                style={{ left: `${pacePct}%`, transform: 'translateX(-50%)' }}
                title={`Expected at this point: $${expectedSpend.toFixed(0)}`}
              />
            )}
          </div>
        )}

        {/* Amounts + pace + reset — single row */}
        {(data?.spent !== null || data?.total !== null) && (
          <div className="flex items-baseline justify-between gap-1">
            <span className={`text-xs font-semibold ${textColor}`}>
              ${data?.spent ?? '—'}
              <span className="font-normal text-muted-foreground"> / ${data?.total ?? '—'}</span>
              {showPace && (
                <span className={`ml-1 text-[10px] font-medium ${paceColor}`}>
                  {paceArrow}{paceAmt}
                </span>
              )}
              {total > 0 && (
                <span className={`ml-1 text-[10px] font-medium ${textColor}`}>{pct.toFixed(0)}%</span>
              )}
            </span>
            {resetLabel && (
              <span className="shrink-0 text-[10px] text-muted-foreground">{resetLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
