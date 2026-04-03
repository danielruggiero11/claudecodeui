import { Archive, Check, ChevronDown, ChevronRight, Edit3, Eye, EyeOff, Folder, FolderOpen, Plus, Star, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession, SessionProvider } from '../../../../types/app';
import type { MCPServerStatus, SessionWithProvider } from '../../types/types';
import { getTaskIndicatorStatus } from '../../utils/utils';
import { useSessionStatus } from '../../../../contexts/SessionStatusContext';
import { useFlag } from '../../../../contexts/FlagContext';
import TaskIndicator from './TaskIndicator';
import SidebarProjectSessions from './SidebarProjectSessions';
import TypingDots from './TypingDots';

type SidebarProjectItemProps = {
  project: Project;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  editingProject: string | null;
  editingName: string;
  sessions: SessionWithProvider[];
  initialSessionsLoaded: boolean;
  isLoadingSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  onEditingNameChange: (name: string) => void;
  onToggleProject: (projectName: string) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectName: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectName: string) => void;
  onDeleteProject: (project: Project) => void;
  onHideProject: (project: Project) => void;
  onUnhideProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: SessionProvider,
  ) => void;
  onLoadMoreSessions: (project: Project) => void;
  onNewSession: (project: Project) => void;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: SessionProvider) => void;
  t: TFunction;
};

const getSessionCountDisplay = (sessions: SessionWithProvider[], hasMoreSessions: boolean): string => {
  const sessionCount = sessions.length;
  if (hasMoreSessions && sessionCount >= 5) {
    return `${sessionCount}+`;
  }

  return `${sessionCount}`;
};

export default function SidebarProjectItem({
  project,
  selectedProject,
  selectedSession,
  isExpanded,
  isDeleting,
  isStarred,
  editingProject,
  editingName,
  sessions,
  initialSessionsLoaded,
  isLoadingSessions,
  currentTime,
  editingSession,
  editingSessionName,
  tasksEnabled,
  mcpServerStatus,
  onEditingNameChange,
  onToggleProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onDeleteProject,
  onHideProject,
  onUnhideProject,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  onNewSession,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectItemProps) {
  const isSelected = selectedProject?.name === project.name;
  const isEditing = editingProject === project.name;
  const isArchived = !!project.hidden;
  const hasMoreSessions = project.sessionMeta?.hasMore === true;
  const sessionCountDisplay = getSessionCountDisplay(sessions, hasMoreSessions);
  const sessionCountLabel = `${sessionCountDisplay} session${sessions.length === 1 ? '' : 's'}`;
  const taskStatus = getTaskIndicatorStatus(project, mcpServerStatus);
  const { getProjectStatus } = useSessionStatus();
  const { getProjectFlagCount } = useFlag();
  const projectStatus = getProjectStatus(sessions.map(s => s.id));
  const projectFlagCount = getProjectFlagCount(sessions.map(s => s.id));

  const toggleProject = () => onToggleProject(project.name);
  const toggleStarProject = () => onToggleStarProject(project.name);

  const saveProjectName = () => {
    onSaveProjectName(project.name);
  };

  const selectAndToggleProject = () => {
    if (selectedProject?.name !== project.name) {
      onProjectSelect(project);
    }

    toggleProject();
  };

  return (
    <div className={cn('space-y-1', isDeleting && 'opacity-50 pointer-events-none', isArchived && 'opacity-50')}>
      <div className="group">
          <div
            className={cn(
              'p-3 mx-3 my-1 rounded-lg bg-card border border-border/50 transition-all duration-150',
              isSelected && 'bg-primary/5 border-primary/20',
              isStarred &&
                !isSelected &&
                'bg-yellow-50/50 dark:bg-yellow-900/5 border-yellow-200/30 dark:border-yellow-800/30',
            )}
          >
            {/* Row 1: Title (full width, tappable to expand) */}
            <div className="flex items-center gap-2" onClick={toggleProject}>
              <div
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors relative',
                  projectStatus.respondingCount > 0 ? 'bg-primary/10' :
                  projectStatus.responseReadyCount > 0 ? 'bg-primary/10' :
                  isExpanded ? 'bg-primary/10' : 'bg-muted',
                )}
              >
                {projectStatus.respondingCount > 0 ? (
                  <TypingDots />
                ) : isExpanded ? (
                  <FolderOpen className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {projectStatus.responseReadyCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
                    {projectStatus.responseReadyCount}
                  </span>
                ) : projectFlagCount > 0 && projectStatus.respondingCount === 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-0.5 text-[9px] font-bold text-white">
                    {projectFlagCount}
                  </span>
                ) : null}
              </div>

              {isEditing ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(event) => onEditingNameChange(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border-2 border-primary/40 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-200 focus:border-primary focus:shadow-md focus:outline-none"
                  placeholder={t('projects.projectNamePlaceholder')}
                  autoFocus
                  autoComplete="off"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      saveProjectName();
                    }
                    if (event.key === 'Escape') {
                      onCancelEditingProject();
                    }
                  }}
                  style={{
                    fontSize: '16px',
                    WebkitAppearance: 'none',
                    borderRadius: '8px',
                  }}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground" title={project.displayName}>
                    {project.displayName}
                  </h3>
                  {isArchived && (
                    <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Archive className="h-2.5 w-2.5" /> Archived
                    </span>
                  )}
                </div>
              )}

              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-muted/30">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Row 2: Action buttons */}
            <div className="mt-2 flex items-center gap-1.5">
              {isEditing ? (
                <>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-green-600"
                    onClick={(event) => {
                      event.stopPropagation();
                      saveProjectName();
                    }}
                  >
                    <Check className="h-4 w-4 text-white" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-gray-600"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCancelEditingProject();
                    }}
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </>
              ) : (
                <>
                  {/* New Session button */}
                  <button
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 active:scale-95 dark:border-primary/40 dark:bg-primary/20"
                    onClick={(event) => {
                      event.stopPropagation();
                      onNewSession(project);
                    }}
                    title="New session"
                  >
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary">New</span>
                  </button>

                  <button
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all duration-150 border',
                      isStarred
                        ? 'bg-yellow-500/10 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800'
                        : 'bg-gray-500/10 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStarProject();
                    }}
                    title={isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites')}
                  >
                    <Star
                      className={cn(
                        'w-3.5 h-3.5 transition-colors',
                        isStarred
                          ? 'text-yellow-600 dark:text-yellow-400 fill-current'
                          : 'text-gray-600 dark:text-gray-400',
                      )}
                    />
                  </button>

                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 active:scale-90 dark:border-primary/30 dark:bg-primary/20"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartEditingProject(project);
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5 text-primary" />
                  </button>

                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-500/10 active:scale-90 dark:border-gray-800 dark:bg-gray-900/30"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isArchived) { onUnhideProject(project); } else { onHideProject(project); }
                    }}
                    title={isArchived ? t('tooltips.unhideProject', 'Restore project') : t('tooltips.hideProject', 'Hide project')}
                  >
                    {isArchived
                      ? <Eye className="h-3.5 w-3.5 text-primary" />
                      : <EyeOff className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                    }
                  </button>

                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-500/10 active:scale-90 dark:border-red-800 dark:bg-red-900/30"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteProject(project);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                  </button>
                </>
              )}
            </div>

            {/* Row 3: Session count */}
            {!isEditing && (
              <div className="mt-1.5 text-xs text-muted-foreground">
                {sessionCountLabel}
              </div>
            )}
          </div>
      </div>

      <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        sessions={sessions}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        isLoadingSessions={isLoadingSessions}
        currentTime={currentTime}
        editingSession={editingSession}
        editingSessionName={editingSessionName}
        onEditingSessionNameChange={onEditingSessionNameChange}
        onStartEditingSession={onStartEditingSession}
        onCancelEditingSession={onCancelEditingSession}
        onSaveEditingSession={onSaveEditingSession}
        onProjectSelect={onProjectSelect}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onLoadMoreSessions={onLoadMoreSessions}
        onNewSession={onNewSession}
        t={t}
      />
    </div>
  );
}
