import { useCallback, useEffect, useRef, useState } from 'react';
import { updateSettingsPartial } from '../utils/settingsSync';

export type VoiceSendMode = 'manual' | 'voiceCommand' | 'autoPause';

export type VoiceSettings = {
  enabled: boolean;
  autoStart: boolean;
  sendMode: VoiceSendMode;
  sendCommandPhrase: string;
  autoSendDelay: number;
  language: string;
  showDebug: boolean;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  autoStart: false,
  sendMode: 'voiceCommand',
  sendCommandPhrase: 'send message',
  autoSendDelay: 2000,
  language: 'en-US',
  showDebug: false,
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const stored = localStorage.getItem('voice-settings');
    if (stored) {
      return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_VOICE_SETTINGS };
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  localStorage.setItem('voice-settings', JSON.stringify(settings));
  updateSettingsPartial({ voiceSettings: settings as unknown as Record<string, unknown> }).catch(() => {});
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export type VoiceDebugEntry = {
  ts: number;
  type: string;
  detail: string;
};

type UseVoiceInputArgs = {
  /**
   * Called with finalized text that should be permanently appended to the input.
   * This text is "committed" — it won't change.
   */
  onFinalText: (text: string) => void;
  /**
   * Called with the current interim (in-progress) text.
   * Each call replaces the previous interim text.
   * Called with '' when interim is cleared (finalized or recognition restarted).
   */
  onInterimText: (text: string) => void;
  /** Called when a voice command triggers send or auto-pause fires. */
  onVoiceCommandSend?: () => void;
};

type UseVoiceInputResult = {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  debugLog: VoiceDebugEntry[];
  toggleRecording: () => void;
  startRecording: () => void;
  stopRecording: () => void;
};

export function useVoiceInput({
  onFinalText,
  onInterimText,
  onVoiceCommandSend,
}: UseVoiceInputArgs): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [debugLog, setDebugLog] = useState<VoiceDebugEntry[]>([]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldBeRecordingRef = useRef(false);
  const autoSendTimerRef = useRef<number | null>(null);

  // For Chrome (incremental mode): track how many results we've already committed.
  const committedResultCountRef = useRef(0);
  // For Hermit (cumulative mode): track total final text already emitted to textarea.
  const emittedFinalTextRef = useRef('');
  // Locked mode: detected on first meaningful event, stays for the session.
  // null = not yet detected, 'incremental' = Chrome, 'cumulative' = Hermit
  const detectedModeRef = useRef<'incremental' | 'cumulative' | null>(null);

  const addDebug = useCallback((type: string, detail: string) => {
    setDebugLog((prev) => [...prev.slice(-29), { ts: Date.now(), type, detail }]);
  }, []);

  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;
  const onInterimTextRef = useRef(onInterimText);
  onInterimTextRef.current = onInterimText;
  const onVoiceCommandSendRef = useRef(onVoiceCommandSend);
  onVoiceCommandSendRef.current = onVoiceCommandSend;

  const clearAutoSendTimer = useCallback(() => {
    if (autoSendTimerRef.current !== null) {
      window.clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
  }, []);

  const checkForVoiceCommand = useCallback((text: string): { stripped: string; triggered: boolean } => {
    const settings = loadVoiceSettings();
    if (settings.sendMode !== 'voiceCommand' || !settings.sendCommandPhrase) {
      return { stripped: text, triggered: false };
    }

    const phrase = settings.sendCommandPhrase.toLowerCase().trim();
    const lower = text.toLowerCase().trim();

    if (lower.endsWith(phrase)) {
      const stripped = text.slice(0, text.length - settings.sendCommandPhrase.length).trim();
      return { stripped, triggered: true };
    }

    return { stripped: text, triggered: false };
  }, []);

  const scheduleAutoSend = useCallback(() => {
    const settings = loadVoiceSettings();
    if (settings.sendMode !== 'autoPause') {
      return;
    }

    clearAutoSendTimer();
    autoSendTimerRef.current = window.setTimeout(() => {
      onVoiceCommandSendRef.current?.();
    }, settings.autoSendDelay);
  }, [clearAutoSendTimer]);

  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Speech recognition not supported. Use Chrome or Edge.');
      return null;
    }

    const settings = loadVoiceSettings();
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = settings.language;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
      committedResultCountRef.current = 0;
      // Don't reset emittedFinalTextRef here — it persists across auto-restarts
      addDebug('start', 'recognition started');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Detect mode once: if the first event with actual content has ANY interim result,
      // this browser uses incremental mode (Chrome). Otherwise cumulative (Hermit).
      // Lock mode on first detection — don't flip between events.
      if (detectedModeRef.current === null) {
        let hasAnyInterim = false;
        for (let i = 0; i < event.results.length; i++) {
          if (!event.results[i].isFinal) {
            hasAnyInterim = true;
            break;
          }
        }
        // Only lock mode when we have actual content (skip empty-only events)
        const hasContent = Array.from({ length: event.results.length }, (_, i) => event.results[i])
          .some(r => r[0].transcript !== '');
        if (hasContent || hasAnyInterim) {
          detectedModeRef.current = hasAnyInterim ? 'incremental' : 'cumulative';
          addDebug('mode-lock', `locked to ${detectedModeRef.current}`);
        }
      }

      const mode = detectedModeRef.current || 'incremental';

      // Debug
      const resultsInfo: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        resultsInfo.push(`[${i}] ${r.isFinal ? 'F' : 'i'}: "${r[0].transcript}"`);
      }
      addDebug('onresult', `mode=${mode} rIdx=${event.resultIndex} results(${event.results.length}): ${resultsInfo.join(' | ')}`);

      if (mode === 'cumulative') {
        // HERMIT MODE: Each new final result contains the full cumulative text.
        // Find the last non-empty result — that's the current full transcript.
        let fullText = '';
        for (let i = event.results.length - 1; i >= 0; i--) {
          const t = event.results[i][0].transcript;
          if (t) {
            fullText = t;
            break;
          }
        }

        addDebug('cumulative', `fullText="${fullText}" emitted="${emittedFinalTextRef.current}"`);

        if (!fullText) return;

        // Compute the delta — what's new since last emit
        let delta = '';
        if (fullText.startsWith(emittedFinalTextRef.current)) {
          delta = fullText.slice(emittedFinalTextRef.current.length);
        } else {
          // Text was corrected/replaced by the recognizer — emit full text
          // (shouldn't normally happen, but handle it)
          delta = fullText;
        }

        if (delta) {
          clearAutoSendTimer();
          onInterimTextRef.current('');

          // Check voice command on the full cumulative text
          const { stripped, triggered } = checkForVoiceCommand(fullText);

          if (triggered) {
            // Emit only the delta up to (excluding) the command phrase
            const strippedDelta = stripped.startsWith(emittedFinalTextRef.current)
              ? stripped.slice(emittedFinalTextRef.current.length)
              : stripped;
            if (strippedDelta) {
              onFinalTextRef.current(strippedDelta);
            }
            emittedFinalTextRef.current = '';
            addDebug('send-cmd', `stripped="${stripped}"`);
            setTimeout(() => {
              onVoiceCommandSendRef.current?.();
            }, 100);
          } else {
            onFinalTextRef.current(delta);
            emittedFinalTextRef.current = fullText;
            addDebug('emit-delta', `delta="${delta}"`);
            scheduleAutoSend();
          }
        }
      } else {
        // CHROME MODE: Incremental results with interims.
        // Process only results we haven't committed yet.
        let newFinals = '';
        let currentInterim = '';
        let newCommittedCount = committedResultCountRef.current;

        for (let i = 0; i < event.results.length; i++) {
          if (i < committedResultCountRef.current) continue;
          const result = event.results[i];
          if (result.isFinal) {
            newFinals += result[0].transcript;
            newCommittedCount = i + 1;
          } else {
            currentInterim += result[0].transcript;
          }
        }

        addDebug('incremental', `newFinals="${newFinals}" interim="${currentInterim}" committed=${committedResultCountRef.current}→${newCommittedCount}`);

        if (newFinals) {
          committedResultCountRef.current = newCommittedCount;
          clearAutoSendTimer();
          onInterimTextRef.current('');

          const { stripped, triggered } = checkForVoiceCommand(newFinals);
          if (stripped) {
            onFinalTextRef.current(stripped);
          }
          if (triggered) {
            addDebug('send-cmd', `stripped="${stripped}"`);
            setTimeout(() => {
              onVoiceCommandSendRef.current?.();
            }, 100);
          } else {
            scheduleAutoSend();
          }
        }

        if (currentInterim) {
          clearAutoSendTimer();
          onInterimTextRef.current(currentInterim);
        } else if (!newFinals) {
          onInterimTextRef.current('');
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      setError(`Speech error: ${event.error}`);
      if (event.error === 'not-allowed') {
        shouldBeRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      addDebug('end', `shouldContinue=${shouldBeRecordingRef.current} committed=${committedResultCountRef.current}`);
      // Clear any lingering interim text on restart
      onInterimTextRef.current('');
      committedResultCountRef.current = 0;

      if (shouldBeRecordingRef.current) {
        try {
          const freshSettings = loadVoiceSettings();
          recognition.lang = freshSettings.language;
          recognition.start();
        } catch {
          shouldBeRecordingRef.current = false;
          setIsRecording(false);
        }
      } else {
        setIsRecording(false);
      }
    };

    return recognition;
  }, [checkForVoiceCommand, clearAutoSendTimer, scheduleAutoSend]);

  const startRecording = useCallback(() => {
    setError(null);
    shouldBeRecordingRef.current = true;
    committedResultCountRef.current = 0;
    emittedFinalTextRef.current = '';
    detectedModeRef.current = null;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const recognition = createRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError('Failed to start voice recognition.');
      shouldBeRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [createRecognition]);

  const stopRecording = useCallback(() => {
    shouldBeRecordingRef.current = false;
    clearAutoSendTimer();
    onInterimTextRef.current('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, [clearAutoSendTimer]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      shouldBeRecordingRef.current = false;
      clearAutoSendTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [clearAutoSendTimer]);

  return {
    isRecording,
    isSupported,
    error,
    debugLog,
    toggleRecording,
    startRecording,
    stopRecording,
  };
}
