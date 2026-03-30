import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { Button, DarkModeToggle } from '../../../../shared/view/ui';
import type { CodeEditorSettingsState, ProjectSortOrder } from '../../types/types';
import { getCachedSettings, updateSettingsPartial } from '../../../../utils/settingsSync';
import { authenticatedFetch } from '../../../../utils/api';
import { CLAUDE_MODELS, CURSOR_MODELS, CODEX_MODELS, GEMINI_MODELS } from '../../../../../shared/modelConstants';
import LanguageSelector from '../../../../shared/view/ui/LanguageSelector';
import SettingsCard from '../SettingsCard';
import SettingsRow from '../SettingsRow';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';

type AppearanceSettingsTabProps = {
  projectSortOrder: ProjectSortOrder;
  onProjectSortOrderChange: (value: ProjectSortOrder) => void;
  codeEditorSettings: CodeEditorSettingsState;
  onCodeEditorThemeChange: (value: 'dark' | 'light') => void;
  onCodeEditorWordWrapChange: (value: boolean) => void;
  onCodeEditorShowMinimapChange: (value: boolean) => void;
  onCodeEditorLineNumbersChange: (value: boolean) => void;
  onCodeEditorFontSizeChange: (value: string) => void;
};

export default function AppearanceSettingsTab({
  projectSortOrder,
  onProjectSortOrderChange,
  codeEditorSettings,
  onCodeEditorThemeChange,
  onCodeEditorWordWrapChange,
  onCodeEditorShowMinimapChange,
  onCodeEditorLineNumbersChange,
  onCodeEditorFontSizeChange,
}: AppearanceSettingsTabProps) {
  const { t } = useTranslation('settings');

  // Default tab setting
  const [defaultTab, setDefaultTab] = useState(() => {
    const cached = getCachedSettings();
    return cached?.defaultTab || localStorage.getItem('defaultTab') || 'chat';
  });

  // Mobile sidebar on launch
  const [mobileShowSidebar, setMobileShowSidebar] = useState(() => {
    const cached = getCachedSettings();
    return cached?.mobileShowSidebarOnLaunch ?? localStorage.getItem('mobileShowSidebarOnLaunch') !== 'false';
  });

  // Enabled providers
  const [enabledProviders, setEnabledProviders] = useState(() => {
    const cached = getCachedSettings();
    return cached?.enabledProviders || { claude: true, cursor: true, codex: true, gemini: true };
  });

  // Default models per provider
  const [defaultModels, setDefaultModels] = useState(() => {
    const cached = getCachedSettings();
    return {
      claude: cached?.models?.claude || localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT,
      cursor: cached?.models?.cursor || localStorage.getItem('cursor-model') || CURSOR_MODELS.DEFAULT,
      codex: cached?.models?.codex || localStorage.getItem('codex-model') || CODEX_MODELS.DEFAULT,
      gemini: cached?.models?.gemini || localStorage.getItem('gemini-model') || GEMINI_MODELS.DEFAULT,
    };
  });

  const handleDefaultTabChange = useCallback((value: string) => {
    setDefaultTab(value);
    localStorage.setItem('defaultTab', value);
    updateSettingsPartial({ defaultTab: value }).catch(() => {});
  }, []);

  const handleMobileSidebarChange = useCallback((value: boolean) => {
    setMobileShowSidebar(value);
    localStorage.setItem('mobileShowSidebarOnLaunch', String(value));
    updateSettingsPartial({ mobileShowSidebarOnLaunch: value }).catch(() => {});
  }, []);

  const handleProviderToggle = useCallback((provider: 'claude' | 'cursor' | 'codex' | 'gemini', enabled: boolean) => {
    setEnabledProviders(prev => {
      const next = { ...prev, [provider]: enabled };
      localStorage.setItem('enabledProviders', JSON.stringify(next));
      updateSettingsPartial({ enabledProviders: next }).catch(() => {});
      return next;
    });
  }, []);

  const handleDefaultModelChange = useCallback((provider: 'claude' | 'cursor' | 'codex' | 'gemini', model: string) => {
    setDefaultModels(prev => {
      const next = { ...prev, [provider]: model };
      localStorage.setItem(`${provider}-model`, model);
      updateSettingsPartial({ models: next }).catch(() => {});
      return next;
    });
  }, []);

  // Server restart state
  const [restartPhase, setRestartPhase] = useState<'idle' | 'confirm' | 'calling' | 'countdown' | 'reconnecting'>('idle');
  const [countdown, setCountdown] = useState(20);
  const [restartError, setRestartError] = useState<string | null>(null);

  // Auto-reset confirm after 5 seconds
  useEffect(() => {
    if (restartPhase === 'confirm') {
      const timer = setTimeout(() => setRestartPhase('idle'), 5000);
      return () => clearTimeout(timer);
    }
  }, [restartPhase]);

  // Countdown timer
  useEffect(() => {
    if (restartPhase !== 'countdown') return;
    if (countdown <= 0) {
      setRestartPhase('reconnecting');
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [restartPhase, countdown]);

  // Reconnection polling
  useEffect(() => {
    if (restartPhase !== 'reconnecting') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/health');
        if (res.ok) {
          clearInterval(interval);
          window.location.href = '/';
        }
      } catch {
        // Server not ready yet
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [restartPhase]);

  const handleRestart = useCallback(async () => {
    if (restartPhase === 'idle') {
      setRestartPhase('confirm');
      return;
    }
    if (restartPhase === 'confirm') {
      setRestartPhase('calling');
      setRestartError(null);
      try {
        const res = await authenticatedFetch('/api/system/restart', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setCountdown(20);
          setRestartPhase('countdown');
        } else {
          setRestartError(data.error || 'Restart failed');
          setRestartPhase('idle');
        }
      } catch (err) {
        setRestartError(err instanceof Error ? err.message : 'Request failed');
        setRestartPhase('idle');
      }
    }
  }, [restartPhase]);

  return (
    <div className="space-y-8">
      <SettingsSection title={t('appearanceSettings.darkMode.label')}>
        <SettingsCard>
          <SettingsRow
            label={t('appearanceSettings.darkMode.label')}
            description={t('appearanceSettings.darkMode.description')}
          >
            <DarkModeToggle ariaLabel={t('appearanceSettings.darkMode.label')} />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('mainTabs.appearance')}>
        <SettingsCard>
          <LanguageSelector />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Default View">
        <SettingsCard divided>
          <SettingsRow
            label="Default Tab"
            description="Which tab to show when the app loads"
          >
            <select
              value={defaultTab}
              onChange={(event) => handleDefaultTabChange(event.target.value)}
              className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-36"
            >
              <option value="chat">Chat</option>
              <option value="files">Files</option>
              <option value="git">Source Control</option>
              <option value="shell">Shell</option>
            </select>
          </SettingsRow>
          <SettingsRow
            label="Show Projects on Mobile"
            description="Auto-open the project sidebar when the app launches on mobile"
          >
            <SettingsToggle
              checked={mobileShowSidebar}
              onChange={handleMobileSidebarChange}
              ariaLabel="Show projects on mobile launch"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Enabled Assistants">
        <SettingsCard divided>
          <SettingsRow
            label="Claude Code"
            description="Anthropic's AI coding assistant"
          >
            <SettingsToggle
              checked={enabledProviders.claude}
              onChange={(v) => handleProviderToggle('claude', v)}
              ariaLabel="Enable Claude"
            />
          </SettingsRow>
          <SettingsRow
            label="Cursor"
            description="Cursor AI editor integration"
          >
            <SettingsToggle
              checked={enabledProviders.cursor}
              onChange={(v) => handleProviderToggle('cursor', v)}
              ariaLabel="Enable Cursor"
            />
          </SettingsRow>
          <SettingsRow
            label="Codex"
            description="OpenAI Codex CLI"
          >
            <SettingsToggle
              checked={enabledProviders.codex}
              onChange={(v) => handleProviderToggle('codex', v)}
              ariaLabel="Enable Codex"
            />
          </SettingsRow>
          <SettingsRow
            label="Gemini"
            description="Google Gemini CLI"
          >
            <SettingsToggle
              checked={enabledProviders.gemini}
              onChange={(v) => handleProviderToggle('gemini', v)}
              ariaLabel="Enable Gemini"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Default Models">
        <SettingsCard divided>
          {enabledProviders.claude && (
            <SettingsRow label="Claude" description="Default model for Claude Code sessions">
              <select
                value={defaultModels.claude}
                onChange={(e) => handleDefaultModelChange('claude', e.target.value)}
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44"
              >
                {CLAUDE_MODELS.OPTIONS.map(({ value, label }: { value: string; label: string }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </SettingsRow>
          )}
          {enabledProviders.cursor && (
            <SettingsRow label="Cursor" description="Default model for Cursor sessions">
              <select
                value={defaultModels.cursor}
                onChange={(e) => handleDefaultModelChange('cursor', e.target.value)}
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44"
              >
                {CURSOR_MODELS.OPTIONS.map(({ value, label }: { value: string; label: string }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </SettingsRow>
          )}
          {enabledProviders.codex && (
            <SettingsRow label="Codex" description="Default model for Codex sessions">
              <select
                value={defaultModels.codex}
                onChange={(e) => handleDefaultModelChange('codex', e.target.value)}
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44"
              >
                {CODEX_MODELS.OPTIONS.map(({ value, label }: { value: string; label: string }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </SettingsRow>
          )}
          {enabledProviders.gemini && (
            <SettingsRow label="Gemini" description="Default model for Gemini sessions">
              <select
                value={defaultModels.gemini}
                onChange={(e) => handleDefaultModelChange('gemini', e.target.value)}
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44"
              >
                {GEMINI_MODELS.OPTIONS.map(({ value, label }: { value: string; label: string }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.projectSorting.label')}>
        <SettingsCard>
          <SettingsRow
            label={t('appearanceSettings.projectSorting.label')}
            description={t('appearanceSettings.projectSorting.description')}
          >
            <select
              value={projectSortOrder}
              onChange={(event) => onProjectSortOrderChange(event.target.value as ProjectSortOrder)}
              className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-36"
            >
              <option value="name">{t('appearanceSettings.projectSorting.alphabetical')}</option>
              <option value="date">{t('appearanceSettings.projectSorting.recentActivity')}</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.codeEditor.title')}>
        <SettingsCard divided>
          <SettingsRow
            label={t('appearanceSettings.codeEditor.theme.label')}
            description={t('appearanceSettings.codeEditor.theme.description')}
          >
            <DarkModeToggle
              checked={codeEditorSettings.theme === 'dark'}
              onToggle={(enabled) => onCodeEditorThemeChange(enabled ? 'dark' : 'light')}
              ariaLabel={t('appearanceSettings.codeEditor.theme.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.wordWrap.label')}
            description={t('appearanceSettings.codeEditor.wordWrap.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.wordWrap}
              onChange={onCodeEditorWordWrapChange}
              ariaLabel={t('appearanceSettings.codeEditor.wordWrap.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.showMinimap.label')}
            description={t('appearanceSettings.codeEditor.showMinimap.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.showMinimap}
              onChange={onCodeEditorShowMinimapChange}
              ariaLabel={t('appearanceSettings.codeEditor.showMinimap.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.lineNumbers.label')}
            description={t('appearanceSettings.codeEditor.lineNumbers.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.lineNumbers}
              onChange={onCodeEditorLineNumbersChange}
              ariaLabel={t('appearanceSettings.codeEditor.lineNumbers.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.fontSize.label')}
            description={t('appearanceSettings.codeEditor.fontSize.description')}
          >
            <select
              value={codeEditorSettings.fontSize}
              onChange={(event) => onCodeEditorFontSizeChange(event.target.value)}
              className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-28"
            >
              <option value="10">10px</option>
              <option value="11">11px</option>
              <option value="12">12px</option>
              <option value="13">13px</option>
              <option value="14">14px</option>
              <option value="15">15px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
              <option value="20">20px</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Server Management">
        <SettingsCard>
          <SettingsRow
            label="Restart Server"
            description="Rebuild and restart the application to apply updates"
          >
            <Button
              variant={restartPhase === 'confirm' ? 'destructive' : 'outline'}
              size="sm"
              onClick={handleRestart}
              disabled={restartPhase === 'calling' || restartPhase === 'countdown' || restartPhase === 'reconnecting'}
              className="min-w-[130px]"
            >
              {restartPhase === 'calling' && <RotateCw className="mr-2 h-4 w-4 animate-spin" />}
              {restartPhase === 'idle' && 'Restart'}
              {restartPhase === 'confirm' && 'Confirm Restart'}
              {restartPhase === 'calling' && 'Restarting...'}
            </Button>
          </SettingsRow>
          {restartError && (
            <p className="px-4 pb-3 text-xs text-destructive">{restartError}</p>
          )}
        </SettingsCard>
      </SettingsSection>

      {(restartPhase === 'countdown' || restartPhase === 'reconnecting') && createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/95 text-white">
          <RotateCw className="mb-6 h-12 w-12 animate-spin opacity-60" />
          <h2 className="mb-8 text-3xl font-bold">Server Restarting</h2>
          <div className="font-mono text-[6rem] font-bold leading-none">
            {restartPhase === 'countdown' ? countdown : '...'}
          </div>
          <p className="mt-8 text-lg opacity-80">
            {restartPhase === 'countdown' ? 'Building and restarting...' : 'Reconnecting...'}
          </p>
        </div>,
        document.body
      )}
    </div>
  );
}
