import { useCallback, useEffect, useState } from 'react';
import { Archive, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../utils/api';
import { Button } from '../../../../shared/view/ui';

type ArchivedProject = {
  name: string;
  displayName: string;
  fullPath: string;
};

export default function ArchivedProjectsTab() {
  const { t } = useTranslation('settings');
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringProjects, setRestoringProjects] = useState<Set<string>>(new Set());

  const fetchArchived = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getArchivedProjects();
      if (response.ok) {
        const data = await response.json() as ArchivedProject[];
        setArchivedProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch archived projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArchived();
  }, [fetchArchived]);

  const handleRestore = useCallback(async (projectName: string) => {
    setRestoringProjects((prev) => new Set([...prev, projectName]));
    try {
      const response = await api.hideProject(projectName, false);
      if (response.ok) {
        setArchivedProjects((prev) => prev.filter((p) => p.name !== projectName));
      }
    } catch (error) {
      console.error('Failed to restore project:', error);
    } finally {
      setRestoringProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectName);
        return next;
      });
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('archived.title', 'Archived Projects')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('archived.description', 'Hidden projects are archived here. Restore them to show them in the sidebar again.')}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="ml-2 text-sm">{t('archived.loading', 'Loading archived projects...')}</span>
        </div>
      ) : archivedProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
          <Archive className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t('archived.empty', 'No archived projects')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {t('archived.emptyHint', 'Use the hide button on projects in the sidebar to archive them.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {archivedProjects.map((project) => (
            <div
              key={project.name}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {project.displayName}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={project.fullPath}>
                  {project.fullPath}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-3 flex-shrink-0 gap-1.5"
                disabled={restoringProjects.has(project.name)}
                onClick={() => void handleRestore(project.name)}
              >
                <Eye className="h-3.5 w-3.5" />
                {t('archived.restore', 'Restore')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
