import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../../utils/api';
import { saveSessionPermission, fetchSessionPermission, updateSettingsPartial } from '../../../utils/settingsSync';
import { CLAUDE_MODELS, CODEX_MODELS, CURSOR_MODELS, GEMINI_MODELS } from '../../../../shared/modelConstants';
import type { PendingPermissionRequest, PermissionMode } from '../types/types';
import type { ProjectSession, SessionProvider } from '../../../types/app';

interface UseChatProviderStateArgs {
  selectedSession: ProjectSession | null;
}

function getGlobalDefaultPermissionMode(): PermissionMode {
  const stored = localStorage.getItem('default-permission-mode');
  console.log('[PermMode] getGlobalDefault: stored =', stored);
  return (stored as PermissionMode) || 'default';
}

export function useChatProviderState({ selectedSession }: UseChatProviderStateArgs) {
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(() => {
    const mode = getGlobalDefaultPermissionMode();
    console.log('[PermMode] useState init:', mode);
    return mode;
  });
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<PendingPermissionRequest[]>([]);
  const [provider, setProvider] = useState<SessionProvider>(() => {
    return (localStorage.getItem('selected-provider') as SessionProvider) || 'claude';
  });
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return localStorage.getItem('cursor-model') || CURSOR_MODELS.DEFAULT;
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT;
  });
  const [codexModel, setCodexModel] = useState<string>(() => {
    return localStorage.getItem('codex-model') || CODEX_MODELS.DEFAULT;
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('gemini-model') || GEMINI_MODELS.DEFAULT;
  });

  const lastProviderRef = useRef(provider);

  useEffect(() => {
    if (!selectedSession?.id) {
      // New/blank session — reset to global default
      const globalDefault = getGlobalDefaultPermissionMode();
      console.log('[PermMode] useEffect: no session, resetting to globalDefault =', globalDefault);
      setPermissionMode(globalDefault);
      return;
    }

    const savedMode = localStorage.getItem(`permissionMode-${selectedSession.id}`);
    const globalDefault = getGlobalDefaultPermissionMode();
    const finalMode = (savedMode as PermissionMode) || globalDefault;
    console.log('[PermMode] useEffect: sessionId =', selectedSession.id, '| savedMode =', savedMode, '| globalDefault =', globalDefault, '| finalMode =', finalMode);
    setPermissionMode(finalMode);

    // Also check server for the authoritative value (async, updates if different)
    const sid = selectedSession.id;
    fetchSessionPermission(sid).then((serverMode) => {
      if (serverMode && serverMode !== finalMode) {
        console.log('[PermMode] Server override:', serverMode, '(was', finalMode, ')');
        setPermissionMode(serverMode as PermissionMode);
        localStorage.setItem(`permissionMode-${sid}`, serverMode);
      }
    }).catch(() => {});
  }, [selectedSession?.id]);

  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    setProvider(selectedSession.__provider);
    localStorage.setItem('selected-provider', selectedSession.__provider);
    updateSettingsPartial({ selectedProvider: selectedSession.__provider }).catch(() => {});
  }, [provider, selectedSession]);

  useEffect(() => {
    if (lastProviderRef.current === provider) {
      return;
    }
    setPendingPermissionRequests([]);
    lastProviderRef.current = provider;
  }, [provider]);

  useEffect(() => {
    setPendingPermissionRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
  }, [selectedSession?.id]);

  useEffect(() => {
    if (provider !== 'cursor') {
      return;
    }

    authenticatedFetch('/api/cursor/config')
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.config?.model?.modelId) {
          return;
        }

        const modelId = data.config.model.modelId as string;
        if (!localStorage.getItem('cursor-model')) {
          setCursorModel(modelId);
        }
      })
      .catch((error) => {
        console.error('Error loading Cursor config:', error);
      });
  }, [provider]);

  const cyclePermissionMode = useCallback(() => {
    const modes: PermissionMode[] =
      provider === 'codex'
        ? ['default', 'acceptEdits', 'bypassPermissions']
        : ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setPermissionMode(nextMode);

    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, nextMode);
      // Persist to server
      saveSessionPermission(selectedSession.id, nextMode).catch(() => {});
    }
  }, [permissionMode, provider, selectedSession?.id]);

  return {
    provider,
    setProvider,
    cursorModel,
    setCursorModel,
    claudeModel,
    setClaudeModel,
    codexModel,
    setCodexModel,
    geminiModel,
    setGeminiModel,
    permissionMode,
    setPermissionMode,
    pendingPermissionRequests,
    setPendingPermissionRequests,
    cyclePermissionMode,
  };
}
