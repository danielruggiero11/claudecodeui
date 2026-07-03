import { type ReactNode, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Clock, Folder, MessageSquare, Search } from 'lucide-react';
import type { TFunction } from 'i18next';
import { ScrollArea } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { Project } from '../../../../types/app';
import type { ConversationSearchResults, RecentConversation, SearchProgress } from '../../hooks/useSidebarController';
import { getSessionName, getSessionDate } from '../../utils/utils';
import { useSessionStatus } from '../../../../contexts/SessionStatusContext';
import { useFlag } from '../../../../contexts/FlagContext';
import { useArchive } from '../../../../contexts/ArchiveContext';
import SidebarFooter from './SidebarFooter';
import SidebarHeader from './SidebarHeader';
import SidebarProjectList, { type SidebarProjectListProps } from './SidebarProjectList';
import TypingDots from './TypingDots';

type SearchMode = 'projects' | 'conversations';

function HighlightedSnippet({ snippet, highlights }: { snippet: string; highlights: { start: number; end: number }[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const h of highlights) {
    if (h.start > cursor) {
      parts.push(snippet.slice(cursor, h.start));
    }
    parts.push(
      <mark key={h.start} className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-800">
        {snippet.slice(h.start, h.end)}
      </mark>
    );
    cursor = h.end;
  }
  if (cursor < snippet.length) {
    parts.push(snippet.slice(cursor));
  }
  return (
    <span className="text-xs leading-relaxed text-muted-foreground">
      {parts}
    </span>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

type SidebarContentProps = {
  isPWA: boolean;
  isMobile: boolean;
  isLoading: boolean;
  projects: Project[];
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  onClearSearchFilter: () => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  recentConversations: RecentConversation[];
  archivedConversations: RecentConversation[];
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  conversationResults: ConversationSearchResults | null;
  isSearching: boolean;
  searchProgress: SearchProgress | null;
  onConversationResultClick: (projectName: string, sessionId: string, provider: string, messageTimestamp?: string | null, messageSnippet?: string | null) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCreateProject: () => void;
  onCollapseSidebar: () => void;
  onShowSettings: () => void;
  projectListProps: SidebarProjectListProps;
  t: TFunction;
};

export default function SidebarContent({
  isPWA,
  isMobile,
  isLoading,
  projects,
  searchFilter,
  onSearchFilterChange,
  onClearSearchFilter,
  searchMode,
  onSearchModeChange,
  recentConversations,
  archivedConversations,
  onArchiveSession,
  onUnarchiveSession,
  conversationResults,
  isSearching,
  searchProgress,
  onConversationResultClick,
  onRefresh,
  isRefreshing,
  onCreateProject,
  onCollapseSidebar,
  onShowSettings,
  projectListProps,
  t,
}: SidebarContentProps) {
  const { statusMap } = useSessionStatus();
  const { isSessionFlagged } = useFlag();
  const { isSessionArchived } = useArchive();
  const [archivedOpen, setArchivedOpen] = useState(false);
  const showConversationSearch = searchMode === 'conversations' && searchFilter.trim().length >= 2;
  const showRecentConversations = searchMode === 'conversations' && searchFilter.trim().length < 2;
  const hasPartialResults = conversationResults && conversationResults.results.length > 0;

  return (
    <div
      className="flex h-full flex-col bg-background/80 backdrop-blur-sm md:w-72 md:select-none"
      style={{}}
    >
      <SidebarHeader
        isPWA={isPWA}
        isMobile={isMobile}
        isLoading={isLoading}
        projectsCount={projects.length}
        searchFilter={searchFilter}
        onSearchFilterChange={onSearchFilterChange}
        onClearSearchFilter={onClearSearchFilter}
        searchMode={searchMode}
        onSearchModeChange={onSearchModeChange}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onCreateProject={onCreateProject}
        onCollapseSidebar={onCollapseSidebar}
        t={t}
      />

      <ScrollArea className="flex-1 overflow-y-auto overscroll-contain md:px-1.5 md:py-2">
        {showConversationSearch ? (
          isSearching && !hasPartialResults ? (
            <div className="px-4 py-12 text-center md:py-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
              <p className="text-sm text-muted-foreground">{t('search.searching')}</p>
              {searchProgress && (
                <p className="mt-1 text-xs text-muted-foreground/60">
                  {t('search.projectsScanned', { count: searchProgress.scannedProjects })}/{searchProgress.totalProjects}
                </p>
              )}
            </div>
          ) : !isSearching && conversationResults && conversationResults.results.length === 0 ? (
            <div className="px-4 py-12 text-center md:py-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('search.noResults')}</h3>
              <p className="text-sm text-muted-foreground">{t('search.tryDifferentQuery')}</p>
            </div>
          ) : hasPartialResults ? (
            <div className="space-y-3 px-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                  {t('search.matches', { count: conversationResults.totalMatches })}
                </p>
                {isSearching && searchProgress && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/40 border-t-primary" />
                    <p className="text-[10px] text-muted-foreground/60">
                      {searchProgress.scannedProjects}/{searchProgress.totalProjects}
                    </p>
                  </div>
                )}
              </div>
              {isSearching && searchProgress && (
                <div className="mx-1 h-0.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all duration-300"
                    style={{ width: `${Math.round((searchProgress.scannedProjects / searchProgress.totalProjects) * 100)}%` }}
                  />
                </div>
              )}
              {conversationResults.results.map((projectResult) => (
                <div key={projectResult.projectName} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-1 py-1">
                    <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs font-medium text-foreground">
                      {projectResult.projectDisplayName}
                    </span>
                  </div>
                  {projectResult.sessions.map((session) => (
                    <button
                      key={`${projectResult.projectName}-${session.sessionId}`}
                      className={cn(
                        'w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50',
                        isSessionArchived(session.sessionId) && 'opacity-50',
                      )}
                      onClick={() => onConversationResultClick(
                        projectResult.projectName,
                        session.sessionId,
                        session.provider || session.matches[0]?.provider || 'claude',
                        session.matches[0]?.timestamp,
                        session.matches[0]?.snippet
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3 flex-shrink-0 text-primary" />
                        <span className="truncate text-xs font-medium text-foreground">
                          {session.sessionSummary}
                        </span>
                        {isSessionArchived(session.sessionId) && (
                          <span className="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                            Archived
                          </span>
                        )}
                        {session.provider && session.provider !== 'claude' && (
                          <span className="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                            {session.provider}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 pl-4">
                        {session.matches.map((match, idx) => (
                          <div key={idx} className="flex items-start gap-1">
                            <span className="mt-0.5 flex-shrink-0 text-[10px] font-medium uppercase text-muted-foreground/60">
                              {match.role === 'user' ? 'U' : 'A'}
                            </span>
                            <HighlightedSnippet
                              snippet={match.snippet}
                              highlights={match.highlights}
                            />
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null
        ) : showRecentConversations ? (
          recentConversations.length > 0 || archivedConversations.length > 0 ? (
            <div className="space-y-1 px-2">
              {recentConversations.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-1 pb-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('search.recentConversations', 'Recent Conversations')}
                    </span>
                  </div>
                  {recentConversations.map((item) => {
                    const sessionDate = getSessionDate(item.session);
                    const sessionName = getSessionName(item.session, t);
                    const sessionLiveStatus = statusMap[item.session.id]?.status || 'idle';
                    return (
                      <div key={`${item.projectName}-${item.session.id}`} className="group relative">
                        <button
                          className="w-full rounded-md px-2 py-2 pr-8 text-left transition-colors hover:bg-accent/50 relative"
                          onClick={() => onConversationResultClick(
                            item.projectName,
                            item.session.id,
                            item.provider,
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
                              <span className="truncate text-[11px] text-muted-foreground">
                                {item.projectDisplayName}
                              </span>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1.5">
                              {sessionLiveStatus === 'responding' && <TypingDots className="scale-75" />}
                              {sessionLiveStatus === 'response-ready' ? (
                                <div className="h-2 w-2 rounded-full bg-primary" />
                              ) : isSessionFlagged(item.session.id) && sessionLiveStatus === 'idle' ? (
                                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                              ) : null}
                              <span className="text-[10px] text-muted-foreground/50">
                                {formatRelativeTime(sessionDate)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 pl-0.5">
                            <MessageSquare className="h-3 w-3 flex-shrink-0 text-primary" />
                            <span className={cn(
                              'truncate text-xs text-foreground',
                              sessionLiveStatus !== 'idle' ? 'font-semibold' : 'font-normal',
                            )}>
                              {sessionName}
                            </span>
                            {item.provider !== 'claude' && (
                              <span className="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                                {item.provider}
                              </span>
                            )}
                          </div>
                        </button>
                        <button
                          className={cn(
                            'absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded',
                            'hover:bg-accent/80 active:scale-95 transition-all',
                            isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-60',
                          )}
                          onClick={(e) => { e.stopPropagation(); onArchiveSession(item.session.id); }}
                          title="Archive"
                        >
                          <Archive className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Archived section — collapsible */}
              {archivedConversations.length > 0 && (
                <div className="pt-2">
                  <button
                    className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left hover:bg-accent/30"
                    onClick={() => setArchivedOpen(v => !v)}
                  >
                    {archivedOpen
                      ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    }
                    <Archive className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Archived ({archivedConversations.length})
                    </span>
                  </button>
                  {archivedOpen && (
                    <div className="mt-1 space-y-1">
                      {archivedConversations.map((item) => {
                        const sessionDate = getSessionDate(item.session);
                        const sessionName = getSessionName(item.session, t);
                        const sessionLiveStatus = statusMap[item.session.id]?.status || 'idle';
                        return (
                          <div key={`arch-${item.projectName}-${item.session.id}`} className="group relative opacity-50">
                            <button
                              className="w-full rounded-md px-2 py-2 pr-8 text-left transition-colors hover:bg-accent/50"
                              onClick={() => onConversationResultClick(
                                item.projectName,
                                item.session.id,
                                item.provider,
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
                                  <span className="truncate text-[11px] text-muted-foreground">
                                    {item.projectDisplayName}
                                  </span>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-1.5">
                                  {sessionLiveStatus === 'responding' && <TypingDots className="scale-75" />}
                                  {sessionLiveStatus === 'response-ready' ? (
                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                  ) : null}
                                  <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                                    Archived
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/50">
                                    {formatRelativeTime(sessionDate)}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 pl-0.5">
                                <MessageSquare className="h-3 w-3 flex-shrink-0 text-primary" />
                                <span className="truncate text-xs text-foreground font-normal">
                                  {sessionName}
                                </span>
                                {item.provider !== 'claude' && (
                                  <span className="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                                    {item.provider}
                                  </span>
                                )}
                              </div>
                            </button>
                            <button
                              className={cn(
                                'absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded',
                                'hover:bg-accent/80 active:scale-95 transition-all',
                                isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-100',
                              )}
                              onClick={(e) => { e.stopPropagation(); onUnarchiveSession(item.session.id); }}
                              title="Unarchive"
                            >
                              <ArchiveRestore className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-12 text-center md:py-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('search.noConversations', 'No conversations yet')}</p>
            </div>
          )
        ) : (
          <SidebarProjectList {...projectListProps} />
        )}
      </ScrollArea>

      <SidebarFooter
        onShowSettings={onShowSettings}
        t={t}
      />
    </div>
  );
}
