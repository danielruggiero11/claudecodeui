import { Check } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGitSettings } from '../../../hooks/useGitSettings';
import { getCachedSettings, updateSettingsPartial } from '../../../../../utils/settingsSync';
import { Button, Input } from '../../../../../shared/view/ui';
import SettingsCard from '../../SettingsCard';
import SettingsSection from '../../SettingsSection';
import SettingsToggle from '../../SettingsToggle';

export default function GitSettingsTab() {
  const { t } = useTranslation('settings');
  const {
    gitName,
    setGitName,
    gitEmail,
    setGitEmail,
    isLoading,
    isSaving,
    saveStatus,
    saveGitConfig,
  } = useGitSettings();

  const [autoStageAll, setAutoStageAll] = useState(() => {
    const cached = getCachedSettings();
    return cached?.gitAutoStageAll ?? localStorage.getItem('gitAutoStageAll') === 'true';
  });

  const handleAutoStageToggle = useCallback((value: boolean) => {
    setAutoStageAll(value);
    localStorage.setItem('gitAutoStageAll', String(value));
    updateSettingsPartial({ gitAutoStageAll: value }).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('git.title')}
        description={t('git.description')}
      >
        <SettingsCard className="p-4">
          <div className="space-y-4">
            <div>
              <label htmlFor="settings-git-name" className="mb-2 block text-sm font-medium text-foreground">
                {t('git.name.label')}
              </label>
              <Input
                id="settings-git-name"
                type="text"
                value={gitName}
                onChange={(event) => setGitName(event.target.value)}
                placeholder="John Doe"
                disabled={isLoading}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('git.name.help')}</p>
            </div>

            <div>
              <label htmlFor="settings-git-email" className="mb-2 block text-sm font-medium text-foreground">
                {t('git.email.label')}
              </label>
              <Input
                id="settings-git-email"
                type="email"
                value={gitEmail}
                onChange={(event) => setGitEmail(event.target.value)}
                placeholder="john@example.com"
                disabled={isLoading}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('git.email.help')}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={saveGitConfig}
                disabled={isSaving || !gitName.trim() || !gitEmail.trim()}
              >
                {isSaving ? t('git.actions.saving') : t('git.actions.save')}
              </Button>

              {saveStatus === 'success' && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  {t('git.status.success')}
                </div>
              )}
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title={t('git.staging.title')}
        description={t('git.staging.description')}
      >
        <SettingsCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t('git.staging.autoStageLabel')}</p>
              <p className="text-xs text-muted-foreground">{t('git.staging.autoStageHelp')}</p>
            </div>
            <SettingsToggle
              checked={autoStageAll}
              onChange={handleAutoStageToggle}
              ariaLabel={t('git.staging.autoStageLabel')}
            />
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
