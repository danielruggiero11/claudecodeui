import { useCallback, useEffect, useRef, useState } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import type { UseShellRuntimeOptions, UseShellRuntimeResult } from '../types/types';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { sendSocketMessage } from '../utils/socket';
import { useShellConnection } from './useShellConnection';
import { useShellTerminal } from './useShellTerminal';

export function useShellRuntime({
  selectedProject,
  selectedSession,
  initialCommand,
  isPlainShell,
  minimal,
  autoConnect,
  isRestarting,
  onProcessComplete,
  onOutputRef,
  launchConfig,
  enhancedInputMode,
}: UseShellRuntimeOptions): UseShellRuntimeResult {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [authUrl, setAuthUrl] = useState('');
  const [authUrlVersion, setAuthUrlVersion] = useState(0);

  const selectedProjectRef = useRef(selectedProject);
  const selectedSessionRef = useRef(selectedSession);
  const initialCommandRef = useRef(initialCommand);
  const isPlainShellRef = useRef(isPlainShell);
  const onProcessCompleteRef = useRef(onProcessComplete);
  const authUrlRef = useRef('');
  const lastSessionIdRef = useRef<string | null>(selectedSession?.id ?? null);
  const launchConfigRef = useRef(launchConfig);
  const enhancedInputModeRef = useRef(enhancedInputMode ?? false);

  // Keep mutable values in refs so websocket handlers always read current data.
  useEffect(() => {
    selectedProjectRef.current = selectedProject;
    selectedSessionRef.current = selectedSession;
    initialCommandRef.current = initialCommand;
    isPlainShellRef.current = isPlainShell;
    onProcessCompleteRef.current = onProcessComplete;
    launchConfigRef.current = launchConfig;
    enhancedInputModeRef.current = enhancedInputMode ?? false;
  }, [selectedProject, selectedSession, initialCommand, isPlainShell, onProcessComplete, launchConfig, enhancedInputMode]);

  const setCurrentAuthUrl = useCallback((nextAuthUrl: string) => {
    authUrlRef.current = nextAuthUrl;
    setAuthUrl(nextAuthUrl);
    setAuthUrlVersion((previous) => previous + 1);
  }, []);

  const closeSocket = useCallback(() => {
    const activeSocket = wsRef.current;
    if (!activeSocket) {
      return;
    }

    if (
      activeSocket.readyState === WebSocket.OPEN ||
      activeSocket.readyState === WebSocket.CONNECTING
    ) {
      activeSocket.close();
    }

    wsRef.current = null;
  }, []);

  const openAuthUrlInBrowser = useCallback((url = authUrlRef.current) => {
    if (!url) {
      return false;
    }

    const popup = window.open(url, '_blank');
    if (popup) {
      try {
        popup.opener = null;
      } catch {
        // Ignore cross-origin restrictions when trying to null opener.
      }
      return true;
    }

    return false;
  }, []);

  const copyAuthUrlToClipboard = useCallback(async (url = authUrlRef.current) => {
    if (!url) {
      return false;
    }

    return copyTextToClipboard(url);
  }, []);

  const { isInitialized, clearTerminalScreen, disposeTerminal } = useShellTerminal({
    terminalContainerRef,
    terminalRef,
    fitAddonRef,
    wsRef,
    selectedProject,
    minimal,
    isRestarting,
    initialCommandRef,
    isPlainShellRef,
    authUrlRef,
    copyAuthUrlToClipboard,
    closeSocket,
    enhancedInputModeRef,
  });

  const { isConnected, isConnecting, connectToShell, disconnectFromShell, disconnectSocket } = useShellConnection({
    wsRef,
    terminalRef,
    fitAddonRef,
    selectedProjectRef,
    selectedSessionRef,
    initialCommandRef,
    isPlainShellRef,
    onProcessCompleteRef,
    isInitialized,
    autoConnect,
    closeSocket,
    clearTerminalScreen,
    setAuthUrl: setCurrentAuthUrl,
    onOutputRef,
    launchConfigRef,
  });

  const sendInput = useCallback((data: string) => {
    sendSocketMessage(wsRef.current, { type: 'input', data });
  }, [wsRef]);

  // Refit xterm to its container (for when the shell tab was display:none and is now visible).
  const refitTerminal = useCallback(() => {
    const t = terminalRef.current;
    const f = fitAddonRef.current;
    const socket = wsRef.current;
    const container = terminalContainerRef.current;
    if (!t || !f || !container) return;
    // Skip if container hasn't been laid out yet — the ResizeObserver will catch it later.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    try {
      f.fit();
    } catch {
      return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendSocketMessage(socket, { type: 'resize', cols: t.cols, rows: t.rows });
    }
  }, []);

  useEffect(() => {
    if (!isRestarting) {
      return;
    }

    disconnectSocket();
    disposeTerminal();
  }, [disconnectSocket, disposeTerminal, isRestarting]);

  useEffect(() => {
    if (selectedProject) {
      return;
    }

    disconnectSocket();
    disposeTerminal();
  }, [disconnectSocket, disposeTerminal, selectedProject]);

  useEffect(() => {
    const currentSessionId = selectedSession?.id ?? null;
    console.log('[ShellRuntime] session-change effect', {
      previousSessionId: lastSessionIdRef.current,
      currentSessionId,
      isInitialized,
      willDisconnect: lastSessionIdRef.current !== currentSessionId && isInitialized,
    });
    if (lastSessionIdRef.current !== currentSessionId && isInitialized) {
      disconnectSocket();
    }

    lastSessionIdRef.current = currentSessionId;
  }, [disconnectSocket, isInitialized, selectedSession?.id]);

  return {
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
    disconnectSocket,
    openAuthUrlInBrowser,
    copyAuthUrlToClipboard,
    sendInput,
    refitTerminal,
  };
}
