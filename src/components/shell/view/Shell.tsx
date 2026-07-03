import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '@xterm/xterm/css/xterm.css';
import type { Project, ProjectSession } from '../../../types/app';
import type { PermissionMode } from '../../chat/types/types';
import {
  PROMPT_BUFFER_SCAN_LINES,
  PROMPT_DEBOUNCE_MS,
  PROMPT_MAX_OPTIONS,
  PROMPT_MIN_OPTIONS,
  PROMPT_OPTION_SCAN_LINES,
  SHELL_RESTART_DELAY_MS,
} from '../constants/constants';
import { CLAUDE_MODELS } from '../../../../shared/modelConstants';
import { getDefaultClaudeEffort } from '../../chat/constants/thinkingModes';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useVoiceInput, loadVoiceSettings } from '../../../hooks/useVoiceInput';
import { useFlag } from '../../../contexts/FlagContext';
import { useShellRuntime } from '../hooks/useShellRuntime';
import { useShellComposerState } from '../hooks/useShellComposerState';
import { sendSocketMessage } from '../utils/socket';
import { getSessionDisplayName } from '../utils/auth';
import type { ShellLaunchConfig } from '../types/types';
import ShellConnectionOverlay from './subcomponents/ShellConnectionOverlay';
import ShellEmptyState from './subcomponents/ShellEmptyState';
import ShellHeader from './subcomponents/ShellHeader';
import ShellMinimalView from './subcomponents/ShellMinimalView';
import ShellComposer from './subcomponents/ShellComposer';
import TerminalShortcutsPanel from './subcomponents/TerminalShortcutsPanel';

type CliPromptOption = { number: string; label: string };

type ShellProps = {
  selectedProject?: Project | null;
  selectedSession?: ProjectSession | null;
  initialCommand?: string | null;
  isPlainShell?: boolean;
  onProcessComplete?: ((exitCode: number) => void) | null;
  minimal?: boolean;
  autoConnect?: boolean;
  isActive?: boolean;
};

export default function Shell({
  selectedProject = null,
  selectedSession = null,
  initialCommand = null,
  isPlainShell = false,
  onProcessComplete = null,
  minimal = false,
  autoConnect = false,
  isActive = true,
}: ShellProps) {
  const { t } = useTranslation('chat');
  const [isRestarting, setIsRestarting] = useState(false);
  const [cliPromptOptions, setCliPromptOptions] = useState<CliPromptOption[] | null>(null);
  const promptCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOutputRef = useRef<(() => void) | null>(null);

  // Enhanced shell input — master switch AND quick toggle must both be on
  const { preferences } = useUiPreferences();
  const enhancedShellInput = preferences.enhancedShellInput && preferences.enhancedShellInputActive && !minimal && !isPlainShell;

  // Model / thinking / permission state for the shell composer
  const [claudeModel, setClaudeModel] = useState(
    () => localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT
  );
  const [thinkingMode, setThinkingModeState] = useState(() => getDefaultClaudeEffort());
  const [permissionMode, setPermissionModeState] = useState(
    () => localStorage.getItem('default-permission-mode') || 'default'
  );

  // Persist thinking mode and permission mode so the next shell launch picks them up.
  // Claude Code CLI has no runtime /effort command, so these take effect on reconnect.
  const setThinkingMode = useCallback<typeof setThinkingModeState>((value) => {
    setThinkingModeState((prev) => {
      const next = typeof value === 'function' ? (value as (p: string) => string)(prev) : value;
      try { localStorage.setItem('claude-default-effort', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setPermissionMode = useCallback((mode: string) => {
    setPermissionModeState(mode);
    try { localStorage.setItem('default-permission-mode', mode); } catch { /* ignore */ }
  }, []);

  // Launch config — reflects current state so reconnects pick up changes.
  const launchConfig = useMemo<ShellLaunchConfig>(() => ({
    model: claudeModel,
    effort: thinkingMode,
    permissionMode,
  }), [claudeModel, thinkingMode, permissionMode]);

  // Flag mode
  const { flagSession, unflagSession, isSessionFlagged } = useFlag();
  const activeSessionId = selectedSession?.id ?? null;
  const flagMode = activeSessionId ? isSessionFlagged(activeSessionId) : false;

  const handleToggleFlag = useCallback(() => {
    if (!activeSessionId) return;
    if (isSessionFlagged(activeSessionId)) {
      unflagSession(activeSessionId);
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'flag-mode-change', active: false });
      }
    } else {
      flagSession(activeSessionId);
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'flag-mode-change', active: true });
      }
    }
  }, [activeSessionId, flagSession, unflagSession, isSessionFlagged]);

  const {
    terminalContainerRef,
    terminalRef,
    wsRef,
    isConnected,
    isInitialized,
    isConnecting,
    authUrl,
    authUrlVersion,
    connectToShell,
    disconnectFromShell,
    openAuthUrlInBrowser,
    copyAuthUrlToClipboard,
    sendInput: runtimeSendInput,
    refitTerminal,
  } = useShellRuntime({
    selectedProject,
    selectedSession,
    initialCommand,
    isPlainShell,
    minimal,
    // Defer auto-connect until the shell tab is actually visible. Connecting while
    // display:none means xterm reports 0×0, the PTY spawns tiny, and the welcome
    // banner gets painted squished. Once the tab is active and the container has
    // real dimensions, auto-connect fires with the right cols/rows.
    autoConnect: autoConnect && isActive,
    isRestarting,
    onProcessComplete,
    onOutputRef,
    launchConfig,
    enhancedInputMode: enhancedShellInput,
  });

  // Check xterm.js buffer for CLI prompt patterns (❯ N. label)
  const checkBufferForPrompt = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    const buf = term.buffer.active;
    const lastContentRow = buf.baseY + buf.cursorY;
    const scanEnd = Math.min(buf.baseY + buf.length - 1, lastContentRow + 10);
    const scanStart = Math.max(0, lastContentRow - PROMPT_BUFFER_SCAN_LINES);
    const lines: string[] = [];
    for (let i = scanStart; i <= scanEnd; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString().trimEnd());
    }

    let footerIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/esc to cancel/i.test(lines[i]) || /enter to select/i.test(lines[i])) {
        footerIdx = i;
        break;
      }
    }

    if (footerIdx === -1) {
      setCliPromptOptions(null);
      return;
    }

    // Scan upward from footer collecting numbered options.
    // Non-matching lines are allowed (multi-line labels, blank separators)
    // because CLI prompts may wrap options across multiple terminal rows.
    const optMap = new Map<string, string>();
    const optScanStart = Math.max(0, footerIdx - PROMPT_OPTION_SCAN_LINES);
    for (let i = footerIdx - 1; i >= optScanStart; i--) {
      const match = lines[i].match(/^\s*[❯›>]?\s*(\d+)\.\s+(.+)/);
      if (match) {
        const num = match[1];
        const label = match[2].trim();
        if (parseInt(num, 10) <= PROMPT_MAX_OPTIONS && label.length > 0 && !optMap.has(num)) {
          optMap.set(num, label);
        }
      }
    }

    const valid: CliPromptOption[] = [];
    for (let i = 1; i <= optMap.size; i++) {
      if (optMap.has(String(i))) valid.push({ number: String(i), label: optMap.get(String(i))! });
      else break;
    }

    setCliPromptOptions(valid.length >= PROMPT_MIN_OPTIONS ? valid : null);
  }, [terminalRef]);

  // Schedule prompt check after terminal output (debounced)
  const schedulePromptCheck = useCallback(() => {
    if (promptCheckTimer.current) clearTimeout(promptCheckTimer.current);
    promptCheckTimer.current = setTimeout(checkBufferForPrompt, PROMPT_DEBOUNCE_MS);
  }, [checkBufferForPrompt]);

  // Wire up the onOutput callback
  useEffect(() => {
    onOutputRef.current = schedulePromptCheck;
  }, [schedulePromptCheck]);

  // Cleanup prompt check timer on unmount
  useEffect(() => {
    return () => {
      if (promptCheckTimer.current) clearTimeout(promptCheckTimer.current);
    };
  }, []);

  // Clear stale prompt options and cancel pending timer on disconnect
  useEffect(() => {
    if (!isConnected) {
      if (promptCheckTimer.current) {
        clearTimeout(promptCheckTimer.current);
        promptCheckTimer.current = null;
      }
      setCliPromptOptions(null);
    }
  }, [isConnected]);

  const sendInput = useCallback(
    (data: string) => {
      sendSocketMessage(wsRef.current, { type: 'input', data });
    },
    [wsRef],
  );

  // Model change handler — sends /model command to PTY and updates local state
  const handleClaudeModelChange = useCallback((model: string) => {
    setClaudeModel(model);
    localStorage.setItem('claude-model', model);
    if (isConnected) {
      sendInput(`/model ${model}\r`);
    }
  }, [isConnected, sendInput]);

  // Thinking mode change — sends /effort command to PTY at runtime
  const handleThinkingModeChange = useCallback<typeof setThinkingMode>((value) => {
    setThinkingMode((prev) => {
      const next = typeof value === 'function' ? (value as (p: string) => string)(prev) : value;
      if (isConnected) {
        sendInput(`/effort ${next}\r`);
      }
      return next;
    });
  }, [isConnected, sendInput, setThinkingMode]);

  // Ref-based after-submit hook so the callback always sees current state without
  // needing to be a dep of the composer's handleSubmit useCallback.
  const voiceStopStateRef = useRef({ voiceStopOnSend: preferences.voiceStopOnSend, isVoiceRecording: false, stop: () => {} });

  // Shell composer state (only used when enhanced input is enabled)
  const shellComposerState = useShellComposerState({
    selectedProject: selectedProject ?? null,
    wsRef,
    isConnected,
    sendInput: runtimeSendInput,
    sendByCtrlEnter: preferences.sendByCtrlEnter,
    onAfterSubmit: useCallback(() => {
      if (voiceStopStateRef.current.voiceStopOnSend && voiceStopStateRef.current.isVoiceRecording) {
        voiceStopStateRef.current.stop();
      }
    }, []),
  });

  // Refit xterm when the shell tab becomes visible (was display:none while user was on
  // another tab). xterm can't measure itself while hidden, so it comes back squished
  // unless we tell it to re-fit once the container has its real size.
  useEffect(() => {
    if (!isActive || !isInitialized) return;
    // Two passes: one on next frame, one slightly later — covers most browser layout timings.
    const raf = window.requestAnimationFrame(refitTerminal);
    const timer = window.setTimeout(refitTerminal, 150);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [isActive, isInitialized, refitTerminal]);

  // Focus management — textarea in enhanced mode, terminal otherwise
  useEffect(() => {
    if (!isActive || !isInitialized || !isConnected) {
      return;
    }

    // In enhanced input mode, focus the composer textarea so the user can type
    if (enhancedShellInput) {
      const timeoutId = window.setTimeout(() => {
        shellComposerState.textareaRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timeoutId);
    }

    const focusTerminal = () => {
      terminalRef.current?.focus();
    };

    const animationFrameId = window.requestAnimationFrame(focusTerminal);
    const timeoutId = window.setTimeout(focusTerminal, 0);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [isActive, isConnected, isInitialized, terminalRef, enhancedShellInput, shellComposerState.textareaRef]);

  // Voice input — same pattern as ChatInterface
  const voiceSettings = loadVoiceSettings();
  const voiceInterimLenRef = useRef(0);
  const voiceInsertPosRef = useRef(0);

  const autoResizeTextarea = useCallback(() => {
    setTimeout(() => {
      if (!shellComposerState.textareaRef.current) return;
      shellComposerState.textareaRef.current.style.height = 'auto';
      shellComposerState.textareaRef.current.style.height = `${shellComposerState.textareaRef.current.scrollHeight}px`;
    }, 0);
  }, [shellComposerState.textareaRef]);

  const stripInterim = (prev: string): string => {
    const len = voiceInterimLenRef.current;
    if (len > 0) {
      const end = voiceInsertPosRef.current;
      const start = end - len;
      if (start >= 0 && end <= prev.length) {
        voiceInsertPosRef.current = start;
        return prev.slice(0, start) + prev.slice(end);
      }
    }
    return prev;
  };

  const handleVoiceFinalText = useCallback((text: string) => {
    if (!text) return;
    shellComposerState.setInput((prev: string) => {
      const base = stripInterim(prev);
      voiceInterimLenRef.current = 0;
      const insertPos = voiceInsertPosRef.current;
      const before = base.slice(0, insertPos);
      const after = base.slice(insertPos);
      const separator = before && !before.endsWith(' ') && !text.startsWith(' ') ? ' ' : '';
      voiceInsertPosRef.current = insertPos + separator.length + text.length;
      return before + separator + text + after;
    });
    autoResizeTextarea();
  }, [shellComposerState.setInput, autoResizeTextarea]);

  const handleVoiceInterimText = useCallback((text: string) => {
    shellComposerState.setInput((prev: string) => {
      const base = stripInterim(prev);
      if (!text) {
        voiceInterimLenRef.current = 0;
        return base;
      }
      const insertPos = voiceInsertPosRef.current;
      const before = base.slice(0, insertPos);
      const after = base.slice(insertPos);
      const separator = before && !before.endsWith(' ') && !text.startsWith(' ') ? ' ' : '';
      const inserted = separator + text;
      voiceInterimLenRef.current = inserted.length;
      voiceInsertPosRef.current = insertPos + inserted.length;
      return before + inserted + after;
    });
    autoResizeTextarea();
  }, [shellComposerState.setInput, autoResizeTextarea]);

  const handleVoiceCommandSend = useCallback(() => {
    if (voiceInterimLenRef.current > 0) {
      shellComposerState.setInput((prev: string) => {
        const base = stripInterim(prev).trimEnd();
        voiceInterimLenRef.current = 0;
        return base;
      });
    }
    setTimeout(() => {
      shellComposerState.handleSubmit({ preventDefault: () => undefined } as React.FormEvent<HTMLFormElement>);
    }, 150);
  }, [shellComposerState.handleSubmit, shellComposerState.setInput]);

  const {
    isRecording: isVoiceRecording,
    isSupported: isVoiceSupported,
    error: voiceError,
    debugLog: voiceDebugLog,
    toggleRecording: rawToggleVoiceRecording,
    stopRecording: rawStopVoiceRecording,
  } = useVoiceInput({
    onFinalText: handleVoiceFinalText,
    onInterimText: handleVoiceInterimText,
    onVoiceCommandSend: handleVoiceCommandSend,
  });

  // Keep the ref current so onAfterSubmit always sees the latest values.
  // Use stopRecording directly (not toggle) so we never accidentally restart.
  voiceStopStateRef.current = { voiceStopOnSend: preferences.voiceStopOnSend, isVoiceRecording, stop: rawStopVoiceRecording };

  // Stop recording when the quick toggle turns off enhanced input
  useEffect(() => {
    if (!enhancedShellInput && isVoiceRecording) {
      rawStopVoiceRecording();
    }
  }, [enhancedShellInput, isVoiceRecording, rawStopVoiceRecording]);

  const toggleVoiceRecording = useCallback(() => {
    if (!isVoiceRecording) {
      voiceInsertPosRef.current = shellComposerState.textareaRef.current?.selectionStart ?? shellComposerState.input.length;
    }
    rawToggleVoiceRecording();
  }, [isVoiceRecording, rawToggleVoiceRecording, shellComposerState.textareaRef, shellComposerState.input.length]);


  const sessionDisplayName = useMemo(() => getSessionDisplayName(selectedSession), [selectedSession]);
  const sessionDisplayNameShort = useMemo(
    () => (sessionDisplayName ? sessionDisplayName.slice(0, 30) : null),
    [sessionDisplayName],
  );
  const sessionDisplayNameLong = useMemo(
    () => (sessionDisplayName ? sessionDisplayName.slice(0, 50) : null),
    [sessionDisplayName],
  );

  const handleRestartShell = useCallback(() => {
    setIsRestarting(true);
    window.setTimeout(() => {
      setIsRestarting(false);
    }, SHELL_RESTART_DELAY_MS);
  }, []);

  if (!selectedProject) {
    return (
      <ShellEmptyState
        title={t('shell.selectProject.title')}
        description={t('shell.selectProject.description')}
      />
    );
  }

  if (minimal) {
    return (
      <>
        <ShellMinimalView
          terminalContainerRef={terminalContainerRef}
          authUrl={authUrl}
          authUrlVersion={authUrlVersion}
          initialCommand={initialCommand}
          isConnected={isConnected}
          openAuthUrlInBrowser={openAuthUrlInBrowser}
          copyAuthUrlToClipboard={copyAuthUrlToClipboard}
        />
        <TerminalShortcutsPanel
          wsRef={wsRef}
          terminalRef={terminalRef}
          isConnected={isConnected}
          bottomOffset="bottom-0"
        />
      </>
    );
  }

  const readyDescription = isPlainShell
    ? t('shell.runCommand', {
        command: initialCommand || t('shell.defaultCommand'),
        projectName: selectedProject.displayName,
      })
    : selectedSession
      ? t('shell.resumeSession', { displayName: sessionDisplayNameLong })
      : t('shell.startSession');

  const connectingDescription = isPlainShell
    ? t('shell.runCommand', {
        command: initialCommand || t('shell.defaultCommand'),
        projectName: selectedProject.displayName,
      })
    : t('shell.startCli', { projectName: selectedProject.displayName });

  const overlayMode = !isInitialized ? 'loading' : isConnecting ? 'connecting' : !isConnected ? 'connect' : null;
  const overlayDescription = overlayMode === 'connecting' ? connectingDescription : readyDescription;

  return (
    <div className="flex h-full w-full flex-col bg-gray-900">
      <ShellHeader
        isConnected={isConnected}
        isInitialized={isInitialized}
        isRestarting={isRestarting}
        hasSession={Boolean(selectedSession)}
        sessionDisplayNameShort={sessionDisplayNameShort}
        onDisconnect={disconnectFromShell}
        onRestart={handleRestartShell}
        statusNewSessionText={t('shell.status.newSession')}
        statusInitializingText={t('shell.status.initializing')}
        statusRestartingText={t('shell.status.restarting')}
        disconnectLabel={t('shell.actions.disconnect')}
        disconnectTitle={t('shell.actions.disconnectTitle')}
        restartLabel={t('shell.actions.restart')}
        restartTitle={t('shell.actions.restartTitle')}
        disableRestart={isRestarting || isConnected}
      />

      <div className="relative z-0 flex-1 overflow-hidden p-2">
        <div
          ref={terminalContainerRef}
          className="h-full w-full focus:outline-none"
          style={{ outline: 'none', pointerEvents: overlayMode ? 'none' : undefined }}
        />

        {overlayMode && (
          <ShellConnectionOverlay
            mode={overlayMode}
            description={overlayDescription}
            loadingLabel={t('shell.loading')}
            connectLabel={t('shell.actions.connect')}
            connectTitle={t('shell.actions.connectTitle')}
            connectingLabel={t('shell.connecting')}
            onConnect={connectToShell}
          />
        )}

        {cliPromptOptions && isConnected && (
          <div
            className="absolute inset-x-0 bottom-0 z-10 border-t border-gray-700/80 bg-gray-800/95 px-3 py-2 backdrop-blur-sm"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex flex-wrap items-center gap-2">
              {cliPromptOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.number}
                  onClick={() => {
                    sendInput(opt.number);
                    setCliPromptOptions(null);
                  }}
                  className="max-w-36 truncate rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                  title={`${opt.number}. ${opt.label}`}
                >
                  {opt.number}. {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  sendInput('\x1b');
                  setCliPromptOptions(null);
                }}
                className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600"
              >
                Esc
              </button>
            </div>
          </div>
        )}
      </div>

      {enhancedShellInput && isConnected ? (
        <div className="relative z-10">
        <ShellComposer
          {...shellComposerState}
          provider={selectedSession?.__provider || localStorage.getItem('selected-provider') || 'claude'}
          claudeModel={claudeModel}
          onClaudeModelChange={handleClaudeModelChange}
          thinkingMode={thinkingMode}
          setThinkingMode={handleThinkingModeChange}
          permissionMode={permissionMode}
          onSetPermissionMode={(mode: PermissionMode) => setPermissionMode(mode)}
          flagMode={flagMode}
          flagTriggered={flagMode}
          onToggleFlag={handleToggleFlag}
          sendByCtrlEnter={preferences.sendByCtrlEnter}
          wsRef={wsRef}
          sendInput={runtimeSendInput}
          isVoiceRecording={isVoiceRecording}
          isVoiceSupported={isVoiceSupported}
          isVoiceEnabled={voiceSettings.enabled}
          voiceError={voiceError}
          voiceDebugLog={voiceDebugLog}
          voiceShowDebug={voiceSettings.showDebug}
          onToggleVoiceRecording={toggleVoiceRecording}
        />
        </div>
      ) : (
        <TerminalShortcutsPanel
          wsRef={wsRef}
          terminalRef={terminalRef}
          isConnected={isConnected}
        />
      )}

    </div>
  );
}
