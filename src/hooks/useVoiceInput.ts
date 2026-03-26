import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceSendMode = 'manual' | 'voiceCommand' | 'autoPause';

export type VoiceSettings = {
  enabled: boolean;
  autoStart: boolean;
  sendMode: VoiceSendMode;
  sendCommandPhrase: string;
  autoSendDelay: number;
  language: string;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  autoStart: false,
  sendMode: 'voiceCommand',
  sendCommandPhrase: 'send message',
  autoSendDelay: 2000,
  language: 'en-US',
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

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldBeRecordingRef = useRef(false);
  const autoSendTimerRef = useRef<number | null>(null);

  // Track how many results we've already committed so we only process new ones.
  const committedResultCountRef = useRef(0);

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
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Only look at results we haven't already committed.
      // Results before committedResultCount are already finalized and appended.
      let newFinals = '';
      let currentInterim = '';
      let newCommittedCount = committedResultCountRef.current;

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (i < committedResultCountRef.current) {
          // Already committed — skip
          continue;
        }
        if (result.isFinal) {
          newFinals += result[0].transcript;
          newCommittedCount = i + 1;
        } else {
          currentInterim += result[0].transcript;
        }
      }

      // If we have new finalized text, commit it
      if (newFinals) {
        committedResultCountRef.current = newCommittedCount;
        clearAutoSendTimer();

        // Clear interim first since this text is now final
        onInterimTextRef.current('');

        // Check for voice command in the new final text
        const { stripped, triggered } = checkForVoiceCommand(newFinals);

        if (stripped) {
          onFinalTextRef.current(stripped);
        }

        if (triggered) {
          setTimeout(() => {
            onVoiceCommandSendRef.current?.();
          }, 100);
        } else {
          scheduleAutoSend();
        }
      }

      // Update interim text (replaces previous interim)
      if (currentInterim) {
        clearAutoSendTimer();
        onInterimTextRef.current(currentInterim);
      } else if (!newFinals) {
        // No finals and no interim — clear interim display
        onInterimTextRef.current('');
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
    toggleRecording,
    startRecording,
    stopRecording,
  };
}
