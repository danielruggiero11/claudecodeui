import { useCallback, useRef, useState, useEffect } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { MainContentHeaderProps } from '../../types/types';
import { useArchive } from '../../../../contexts/ArchiveContext';
import { useUiPreferences } from '../../../../hooks/useUiPreferences';
import MobileMenuButton from './MobileMenuButton';
import MainContentTabSwitcher from './MainContentTabSwitcher';
import MainContentTitle from './MainContentTitle';

export default function MainContentHeader({
  activeTab,
  setActiveTab,
  selectedProject,
  selectedSession,
  shouldShowTasksTab,
  isMobile,
  onMenuClick,
}: MainContentHeaderProps) {
  const { isSessionArchived, archiveSession, unarchiveSession } = useArchive();
  const { preferences, setPreference } = useUiPreferences();
  // Show the archive button on chat/shell tabs whenever a project is selected — stays
  // visible for new chats (before a session exists); disabled until there's a session to archive.
  const showArchiveButton = Boolean(selectedProject) && (activeTab === 'chat' || activeTab === 'shell');
  const archiveDisabled = !selectedSession;

  // Enhanced shell input toggle — only visible on shell tab when master switch is ON
  const showEnhancedShellToggle = activeTab === 'shell' && preferences.enhancedShellInput;
  const enhancedShellOn = preferences.enhancedShellInputActive;
  const isArchived = selectedSession ? isSessionArchived(selectedSession.id) : false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollState]);

  return (
    <div className="pwa-header-safe flex-shrink-0 border-b border-border/60 bg-background px-3 py-1.5 sm:px-4 sm:py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isMobile && <MobileMenuButton onMenuClick={onMenuClick} />}
          <MainContentTitle
            activeTab={activeTab}
            selectedProject={selectedProject}
            selectedSession={selectedSession}
            shouldShowTasksTab={shouldShowTasksTab}
          />
          {showArchiveButton && (
            <button
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              disabled={archiveDisabled}
              title={archiveDisabled ? 'Send a message to create this chat before archiving' : (isArchived ? 'Unarchive conversation' : 'Archive conversation')}
              onClick={() => {
                if (!selectedSession) return;
                isArchived ? unarchiveSession(selectedSession.id) : archiveSession(selectedSession.id);
              }}
            >
              {isArchived
                ? <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
                : <Archive className="h-4 w-4 text-muted-foreground" />
              }
            </button>
          )}

          {showEnhancedShellToggle && (
            <button
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-accent active:scale-95 ${enhancedShellOn ? 'text-primary' : 'text-muted-foreground'}`}
              title={enhancedShellOn ? 'Enhanced input: ON (click to disable)' : 'Enhanced input: OFF (click to enable)'}
              onClick={() => setPreference('enhancedShellInputActive', !enhancedShellOn)}
            >
              {/* Terminal split-view icon: top = terminal output, bottom = input area */}
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <line x1="2" y1="14" x2="22" y2="14" />
                <path d="M6 9l3 3-3 3" />
                <line x1="13" y1="18" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="relative min-w-0 flex-shrink overflow-hidden sm:flex-shrink-0">
          {canScrollLeft && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
          )}
          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            className="scrollbar-hide overflow-x-auto"
          >
            <MainContentTabSwitcher
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              shouldShowTasksTab={shouldShowTasksTab}
            />
          </div>
          {canScrollRight && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
          )}
        </div>
      </div>
    </div>
  );
}
