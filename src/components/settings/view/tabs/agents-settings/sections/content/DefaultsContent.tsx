import { useCallback, useState } from 'react';
import { getCachedSettings, updateSettingsPartial } from '../../../../../../../utils/settingsSync';
import { CLAUDE_MODELS, CURSOR_MODELS, CODEX_MODELS, GEMINI_MODELS } from '../../../../../../../../shared/modelConstants';
import { claudeEffortModes } from '../../../../../../chat/constants/thinkingModes';
import type { AgentProvider } from '../../../../../types/types';

type DefaultsContentProps = {
  agent: AgentProvider;
};

const MODEL_OPTIONS: Record<string, { OPTIONS: { value: string; label: string }[]; DEFAULT: string }> = {
  claude: CLAUDE_MODELS,
  cursor: CURSOR_MODELS,
  codex: CODEX_MODELS,
  gemini: GEMINI_MODELS,
};

export default function DefaultsContent({ agent }: DefaultsContentProps) {
  const [defaultModel, setDefaultModel] = useState(() => {
    const cached = getCachedSettings();
    return cached?.models?.[agent as keyof typeof cached.models]
      || localStorage.getItem(`${agent}-model`)
      || MODEL_OPTIONS[agent]?.DEFAULT
      || '';
  });

  const [defaultEffort, setDefaultEffort] = useState(() => {
    const cached = getCachedSettings();
    return cached?.defaultEffort || localStorage.getItem('claude-default-effort') || 'none';
  });

  const handleModelChange = useCallback((model: string) => {
    setDefaultModel(model);
    localStorage.setItem(`${agent}-model`, model);
    const cached = getCachedSettings();
    const currentModels = cached?.models || { claude: '', cursor: '', codex: '', gemini: '' };
    updateSettingsPartial({ models: { ...currentModels, [agent]: model } }).catch(() => {});
  }, [agent]);

  const handleEffortChange = useCallback((effort: string) => {
    setDefaultEffort(effort);
    localStorage.setItem('claude-default-effort', effort);
    updateSettingsPartial({ defaultEffort: effort }).catch(() => {});
  }, []);

  const modelOptions = MODEL_OPTIONS[agent];

  return (
    <div className="space-y-4">
      {/* Default Model */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">Default Model</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Model used for new sessions
            </div>
          </div>
          <div className="flex-shrink-0">
            <select
              value={defaultModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44"
            >
              {modelOptions?.OPTIONS.map(({ value, label }: { value: string; label: string }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Default Effort Level — Claude only */}
      {agent === 'claude' && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">Default Effort</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                Controls how much reasoning Claude uses. Standard uses the SDK default (high).
              </div>
            </div>
            <div className="flex-shrink-0">
              <select
                value={defaultEffort}
                onChange={(e) => handleEffortChange(e.target.value)}
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44"
              >
                {claudeEffortModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}{mode.id === 'none' ? ' (SDK default: high)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
