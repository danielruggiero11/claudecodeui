import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionMode, Provider } from '../../types/types';
import ThinkingModeSelector from './ThinkingModeSelector';
import ModelSelector from './ModelSelector';
import PermissionModeSelector from './PermissionModeSelector';
import TokenUsagePie from './TokenUsagePie';

interface ChatInputControlsProps {
  permissionMode: PermissionMode | string;
  onSetPermissionMode: (mode: PermissionMode) => void;
  provider: Provider | string;
  claudeModel: string;
  onClaudeModelChange: (model: string) => void;
  thinkingMode: string;
  setThinkingMode: React.Dispatch<React.SetStateAction<string>>;
  tokenBudget: { used?: number; total?: number } | null;
  slashCommandsCount: number;
  onToggleCommandMenu: () => void;
  hasInput: boolean;
  onClearInput: () => void;
  isUserScrolledUp: boolean;
  hasMessages: boolean;
  onScrollToBottom: () => void;
  flagMode: boolean;
  flagTriggered: boolean;
  onToggleFlag: () => void;
  hideTokenUsage?: boolean;
  onShowContext?: () => void;
}

export default function ChatInputControls({
  permissionMode,
  onSetPermissionMode,
  provider,
  claudeModel,
  onClaudeModelChange,
  thinkingMode,
  setThinkingMode,
  tokenBudget,
  slashCommandsCount,
  onToggleCommandMenu,
  hasInput,
  onClearInput,
  isUserScrolledUp,
  hasMessages,
  onScrollToBottom,
  flagMode,
  flagTriggered,
  onToggleFlag,
  hideTokenUsage = false,
  onShowContext,
}: ChatInputControlsProps) {
  const { t } = useTranslation('chat');

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      <PermissionModeSelector
        permissionMode={permissionMode}
        onModeSelect={onSetPermissionMode}
        provider={provider as string}
      />

      {provider === 'claude' && (
        <ModelSelector selectedModel={claudeModel} onModelChange={onClaudeModelChange} />
      )}

      {provider === 'claude' && (
        <ThinkingModeSelector selectedMode={thinkingMode} onModeChange={setThinkingMode} onClose={() => {}} className="" provider={provider} />
      )}

      {!hideTokenUsage && <TokenUsagePie used={tokenBudget?.used || 0} total={tokenBudget?.total || parseInt(import.meta.env.VITE_CONTEXT_WINDOW) || 160000} />}

      {onShowContext && (
        <button
          type="button"
          onClick={onShowContext}
          className="flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground sm:h-8"
          title="Show context usage (/context)"
        >
          <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 2" />
          </svg>
          <span className="text-xs font-medium">Context</span>
        </button>
      )}

      <button
        type="button"
        onClick={onToggleCommandMenu}
        className="relative flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground sm:h-8 sm:w-8"
        title={t('input.showAllCommands')}
      >
        <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
        {slashCommandsCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground sm:h-5 sm:w-5">
            {slashCommandsCount}
          </span>
        )}
      </button>

      {hasInput && (
        <button
          type="button"
          onClick={onClearInput}
          className="group flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card shadow-sm transition-all duration-200 hover:bg-accent/60 sm:h-8 sm:w-8"
          title={t('input.clearInput', { defaultValue: 'Clear input' })}
        >
          <svg
            className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground sm:h-4 sm:w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {isUserScrolledUp && hasMessages && (
        <button
          onClick={onScrollToBottom}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all duration-200 hover:scale-105 hover:bg-primary/90 sm:h-8 sm:w-8"
          title={t('input.scrollToBottom', { defaultValue: 'Scroll to bottom' })}
        >
          <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onToggleFlag}
        className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 sm:h-8 sm:w-8 ${
          flagMode
            ? 'bg-yellow-400/20 text-yellow-500 hover:bg-yellow-400/30 dark:bg-yellow-400/15 dark:text-yellow-400 dark:hover:bg-yellow-400/25'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
        }`}
        title={flagMode ? 'Flag active — click to clear' : 'Set validation flag (suppresses notifications)'}
      >
        <svg
          className={`h-4 w-4 sm:h-5 sm:w-5 ${flagMode && flagTriggered ? 'animate-pulse' : ''}`}
          viewBox="0 0 24 24"
          fill={flagMode ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={flagMode ? 0 : 1.75}
        >
          {/* Flag pole */}
          <line x1="4" y1="3" x2="4" y2="21" strokeLinecap="round" strokeWidth={1.75} stroke="currentColor" />
          {/* Flag body */}
          <path d="M4 3 L20 8 L4 13 Z" />
        </svg>
        {flagMode && flagTriggered && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-500" />
          </span>
        )}
      </button>
    </div>
  );
}
