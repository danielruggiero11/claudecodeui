import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import type { Project, ProjectSession } from '../../../types/app';
import type { ShellLaunchConfig } from '../types/types';
import { TERMINAL_INIT_DELAY_MS } from '../constants/constants';
import { getShellWebSocketUrl, parseShellMessage, sendSocketMessage } from '../utils/socket';

const ANSI_ESCAPE_REGEX =
  /(?:\u001B\[[0-?]*[ -/]*[@-~]|\u009B[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u009D[^\u0007\u009C]*(?:\u0007|\u009C)|\u001B[PX^_][^\u001B]*\u001B\\|[\u0090\u0098\u009E\u009F][^\u009C]*\u009C|\u001B[@-Z\\-_])/g;
const PROCESS_EXIT_REGEX = /Process exited with code (\d+)/;

type UseShellConnectionOptions = {
  wsRef: MutableRefObject<WebSocket | null>;
  terminalRef: MutableRefObject<Terminal | null>;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  selectedProjectRef: MutableRefObject<Project | null | undefined>;
  selectedSessionRef: MutableRefObject<ProjectSession | null | undefined>;
  initialCommandRef: MutableRefObject<string | null | undefined>;
  isPlainShellRef: MutableRefObject<boolean>;
  onProcessCompleteRef: MutableRefObject<((exitCode: number) => void) | null | undefined>;
  isInitialized: boolean;
  autoConnect: boolean;
  closeSocket: () => void;
  clearTerminalScreen: () => void;
  setAuthUrl: (nextAuthUrl: string) => void;
  onOutputRef?: MutableRefObject<(() => void) | null>;
  launchConfigRef?: MutableRefObject<ShellLaunchConfig | undefined>;
};

type UseShellConnectionResult = {
  isConnected: boolean;
  isConnecting: boolean;
  closeSocket: () => void;
  connectToShell: () => void;
  disconnectFromShell: () => void;
  disconnectSocket: () => void;
};

export function useShellConnection({
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
  setAuthUrl,
  onOutputRef,
  launchConfigRef,
}: UseShellConnectionOptions): UseShellConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectingRef = useRef(false);
  const manuallyDisconnectedRef = useRef(false);

  const handleProcessCompletion = useCallback(
    (output: string) => {
      if (!isPlainShellRef.current || !onProcessCompleteRef.current) {
        return;
      }

      const sanitizedOutput = output.replace(ANSI_ESCAPE_REGEX, '');
      const cleanOutput = sanitizedOutput;
      if (cleanOutput.includes('Process exited with code 0')) {
        onProcessCompleteRef.current(0);
        return;
      }

      const match = cleanOutput.match(PROCESS_EXIT_REGEX);
      if (!match) {
        return;
      }

      const exitCode = Number.parseInt(match[1], 10);
      if (!Number.isNaN(exitCode) && exitCode !== 0) {
        onProcessCompleteRef.current(exitCode);
      }
    },
    [isPlainShellRef, onProcessCompleteRef],
  );

  const handleSocketMessage = useCallback(
    (rawPayload: string) => {
      const message = parseShellMessage(rawPayload);
      if (!message) {
        console.error('[Shell] Error handling WebSocket message:', rawPayload);
        return;
      }

      if (message.type === 'output') {
        const output = typeof message.data === 'string' ? message.data : '';
        handleProcessCompletion(output);
        terminalRef.current?.write(output);
        onOutputRef?.current?.();
        return;
      }

      if (message.type === 'auth_url' || message.type === 'url_open') {
        const nextAuthUrl = typeof message.url === 'string' ? message.url : '';
        if (nextAuthUrl) {
          setAuthUrl(nextAuthUrl);
        }
      }
    },
    [handleProcessCompletion, onOutputRef, setAuthUrl, terminalRef],
  );

  const connectWebSocket = useCallback(
    (isConnectionLocked = false) => {
      if ((connectingRef.current && !isConnectionLocked) || isConnecting || isConnected) {
        return;
      }

      try {
        const wsUrl = getShellWebSocketUrl();
        if (!wsUrl) {
          connectingRef.current = false;
          setIsConnecting(false);
          return;
        }

        connectingRef.current = true;

        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          setIsConnected(true);
          setIsConnecting(false);
          connectingRef.current = false;
          setAuthUrl('');

          window.setTimeout(() => {
            const currentTerminal = terminalRef.current;
            const currentFitAddon = fitAddonRef.current;
            const currentProject = selectedProjectRef.current;
            if (!currentTerminal || !currentFitAddon || !currentProject) {
              return;
            }

            currentFitAddon.fit();

            const config = launchConfigRef?.current;
            const initSessionId = isPlainShellRef.current ? null : selectedSessionRef.current?.id || null;
            const initHasSession = isPlainShellRef.current ? false : Boolean(selectedSessionRef.current);
            console.log('[ShellConn] sending init', {
              projectPath: currentProject.fullPath || currentProject.path || '',
              sessionId: initSessionId,
              hasSession: initHasSession,
              selectedSessionRef: selectedSessionRef.current,
              isPlainShell: isPlainShellRef.current,
            });
            sendSocketMessage(socket, {
              type: 'init',
              projectPath: currentProject.fullPath || currentProject.path || '',
              sessionId: initSessionId,
              hasSession: initHasSession,
              provider: isPlainShellRef.current ? 'plain-shell' : (selectedSessionRef.current?.__provider || localStorage.getItem('selected-provider') || 'claude'),
              cols: currentTerminal.cols,
              rows: currentTerminal.rows,
              initialCommand: initialCommandRef.current,
              isPlainShell: isPlainShellRef.current,
              ...(config && {
                model: config.model,
                effort: config.effort,
                permissionMode: config.permissionMode,
              }),
            });

            // Follow-up refit: catches cases where the container size hadn't
            // settled by the time of the initial fit (tab switch, first mount).
            window.setTimeout(() => {
              const t = terminalRef.current;
              const f = fitAddonRef.current;
              if (!t || !f) return;
              // Guard: don't reflow to 0 cols if the container is still hidden.
              const tDom = (t.element as HTMLElement | null);
              const w = tDom?.clientWidth ?? 0;
              const h = tDom?.clientHeight ?? 0;
              if (w === 0 || h === 0) return;
              f.fit();
              sendSocketMessage(socket, { type: 'resize', cols: t.cols, rows: t.rows });
            }, 300);
          }, TERMINAL_INIT_DELAY_MS);
        };

        socket.onmessage = (event) => {
          const rawPayload = typeof event.data === 'string' ? event.data : String(event.data ?? '');
          handleSocketMessage(rawPayload);
        };

        socket.onclose = () => {
          setIsConnected(false);
          setIsConnecting(false);
          connectingRef.current = false;
          clearTerminalScreen();
        };

        socket.onerror = () => {
          setIsConnected(false);
          setIsConnecting(false);
          connectingRef.current = false;
        };
      } catch {
        setIsConnected(false);
        setIsConnecting(false);
        connectingRef.current = false;
      }
    },
    [
      clearTerminalScreen,
      fitAddonRef,
      handleSocketMessage,
      initialCommandRef,
      isConnected,
      isConnecting,
      isPlainShellRef,
      selectedProjectRef,
      selectedSessionRef,
      setAuthUrl,
      terminalRef,
      wsRef,
    ],
  );

  const connectToShell = useCallback(() => {
    if (!isInitialized || isConnected || isConnecting || connectingRef.current) {
      return;
    }

    manuallyDisconnectedRef.current = false;
    connectingRef.current = true;
    setIsConnecting(true);
    connectWebSocket(true);
  }, [connectWebSocket, isConnected, isConnecting, isInitialized]);

  // Internal disconnect — does NOT set the manual flag (used for restart / session-change).
  const disconnectSocket = useCallback(() => {
    closeSocket();
    clearTerminalScreen();
    setIsConnected(false);
    setIsConnecting(false);
    connectingRef.current = false;
    setAuthUrl('');
  }, [clearTerminalScreen, closeSocket, setAuthUrl]);

  // User-initiated disconnect — sets the manual flag to prevent auto-reconnect.
  const disconnectFromShell = useCallback(() => {
    manuallyDisconnectedRef.current = true;
    disconnectSocket();
  }, [disconnectSocket]);

  // Reset manual-disconnect flag when the session changes (new session = allow auto-connect)
  useEffect(() => {
    manuallyDisconnectedRef.current = false;
  }, [selectedSessionRef.current?.id]);

  useEffect(() => {
    if (!autoConnect || !isInitialized || isConnecting || isConnected) {
      return;
    }
    if (manuallyDisconnectedRef.current) {
      return;
    }

    connectToShell();
  }, [autoConnect, connectToShell, isConnected, isConnecting, isInitialized]);

  return {
    isConnected,
    isConnecting,
    closeSocket,
    connectToShell,
    disconnectFromShell,
    disconnectSocket,
  };
}
