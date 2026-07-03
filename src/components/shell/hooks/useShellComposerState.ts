import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  ReactNode,
  TouchEvent,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { authenticatedFetch } from '../../../utils/api';
import type { Project } from '../../../types/app';

interface UseShellComposerStateArgs {
  selectedProject: Project | null;
  wsRef: MutableRefObject<WebSocket | null>;
  isConnected: boolean;
  sendInput: (data: string) => void;
  sendByCtrlEnter?: boolean;
  onInputFocusChange?: (focused: boolean) => void;
  onAfterSubmit?: () => void;
}

export function useShellComposerState({
  selectedProject,
  wsRef,
  isConnected,
  sendInput,
  sendByCtrlEnter,
  onInputFocusChange,
  onAfterSubmit,
}: UseShellComposerStateArgs) {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState<Map<string, number>>(new Map());
  const [imageErrors, setImageErrors] = useState<Map<string, string>>(new Map());
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const inputHighlightRef = useRef<HTMLDivElement>(null);
  const inputValueRef = useRef(input);
  const onAfterSubmitRef = useRef(onAfterSubmit);
  onAfterSubmitRef.current = onAfterSubmit;

  // Keep ref synced with state regardless of who calls setInput (voice handlers
  // in Shell.tsx call setInput directly and would otherwise leave the ref stale,
  // causing handleSubmit to silently early-return on an apparently-valid input).
  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  // Image handling — same validation as chat composer
  const handleImageFiles = useCallback((files: File[]) => {
    const validFiles = files.filter((file) => {
      if (!file || typeof file !== 'object') return false;
      if (!file.type || !file.type.startsWith('image/')) return false;
      if (!file.size || file.size > 5 * 1024 * 1024) {
        const fileName = file.name || 'Unknown file';
        setImageErrors((prev) => {
          const next = new Map(prev);
          next.set(fileName, 'File too large (max 5MB)');
          return next;
        });
        return false;
      }
      return true;
    });
    if (validFiles.length > 0) {
      setAttachedImages((prev) => [...prev, ...validFiles].slice(0, 5));
    }
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);
      items.forEach((item) => {
        if (!item.type.startsWith('image/')) return;
        const file = item.getAsFile();
        if (file) handleImageFiles([file]);
      });
      if (items.length === 0 && event.clipboardData.files.length > 0) {
        const files = Array.from(event.clipboardData.files);
        const imageFiles = files.filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length > 0) handleImageFiles(imageFiles);
      }
    },
    [handleImageFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
    maxSize: 5 * 1024 * 1024,
    maxFiles: 5,
    onDrop: handleImageFiles,
    noClick: true,
    noKeyboard: true,
  });

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Submit — upload images then send text to PTY
  const handleSubmit = useCallback(
    async (
      event: FormEvent<HTMLFormElement> | MouseEvent | TouchEvent | KeyboardEvent<HTMLTextAreaElement>,
    ) => {
      event.preventDefault();
      console.log('[ShellComposer] handleSubmit fired', {
        eventType: event?.type,
        isSubmitting: isSubmittingRef.current,
        inputLen: inputValueRef.current.length,
        inputTrimLen: inputValueRef.current.trim().length,
        stateInputLen: input.length,
        isConnected,
        hasProject: Boolean(selectedProject),
        projectName: selectedProject?.name ?? null,
        wsReadyState: wsRef.current?.readyState ?? null,
        attachedImageCount: attachedImages.length,
      });
      // Guard against concurrent/double submits (mousedown + form-submit fire in the same click)
      if (isSubmittingRef.current) {
        console.warn('[ShellComposer] submit blocked: already submitting');
        return;
      }
      const currentInput = inputValueRef.current;
      if (!currentInput.trim()) {
        console.warn('[ShellComposer] submit blocked: empty input (ref)', { stateInput: input });
        return;
      }
      if (!isConnected) {
        console.warn('[ShellComposer] submit blocked: shell not connected');
        return;
      }
      if (!selectedProject) {
        console.warn('[ShellComposer] submit blocked: no selected project');
        return;
      }

      isSubmittingRef.current = true;
      try {
        // Clear input immediately so a rapid second call sees empty ref
        setInput('');
        inputValueRef.current = '';
        setIsTextareaExpanded(false);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }

        let finalText = currentInput;

        // Upload images and get file paths
        if (attachedImages.length > 0) {
          const formData = new FormData();
          attachedImages.forEach((file) => formData.append('images', file));

          const response = await authenticatedFetch(
            `/api/projects/${selectedProject.name}/upload-images-for-shell`,
            { method: 'POST', headers: {}, body: formData },
          );
          if (!response.ok) throw new Error('Failed to upload images');

          const result = await response.json();
          if (result.files && result.files.length > 0) {
            const imageNote = `\n\n[Images provided at the following paths:]\n${result.files
              .map((f: { path: string }, i: number) => `${i + 1}. ${f.path}`)
              .join('\n')}`;
            finalText = currentInput + imageNote;
          }
        }

        // Send text and Enter as SEPARATE messages so Claude Code's bracketed-paste
        // detection doesn't swallow the \r into the pasted block.
        // For long text the server chunks writes at 8ms/KB, so we extend the delay
        // to ensure at least 60ms of silence after the last chunk before \r arrives.
        const chunkDelayMs = Math.max(0, Math.ceil(finalText.length / 1024) - 1) * 8;
        const enterDelayMs = chunkDelayMs + 60;
        console.log('[ShellComposer] sending to PTY', {
          textLen: finalText.length,
          wsReadyState: wsRef.current?.readyState ?? null,
          enterDelayMs,
        });
        sendInput(finalText);
        await new Promise((resolve) => setTimeout(resolve, enterDelayMs));
        sendInput('\r');
        console.log('[ShellComposer] submit complete');
        onAfterSubmitRef.current?.();

        setAttachedImages([]);
        setUploadingImages(new Map());
        setImageErrors(new Map());
      } catch (error) {
        console.error('[ShellComposer] submit threw:', error);
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [attachedImages, input, isConnected, selectedProject, sendInput, wsRef],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      setInput(newValue);
      inputValueRef.current = newValue;

      if (!newValue.trim()) {
        event.target.style.height = 'auto';
        setIsTextareaExpanded(false);
        return;
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter') {
        if (event.nativeEvent.isComposing) return;

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
          event.preventDefault();
          handleSubmit(event);
        } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !sendByCtrlEnter) {
          event.preventDefault();
          handleSubmit(event);
        }
      }
    },
    [handleSubmit, sendByCtrlEnter],
  );

  const handleTextareaClick = useCallback(
    (_event: MouseEvent<HTMLTextAreaElement>) => {
      // No file mention tracking needed in shell mode
    },
    [],
  );

  const handleTextareaInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
      target.scrollTop = target.scrollHeight;

      const lineHeight = parseInt(window.getComputedStyle(target).lineHeight);
      setIsTextareaExpanded(target.scrollHeight > lineHeight * 2);
    },
    [],
  );

  const syncInputOverlayScroll = useCallback((target: HTMLTextAreaElement) => {
    if (!inputHighlightRef.current || !target) return;
    inputHighlightRef.current.scrollTop = target.scrollTop;
    inputHighlightRef.current.scrollLeft = target.scrollLeft;
  }, []);

  const handleClearInput = useCallback(() => {
    setInput('');
    inputValueRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    setIsTextareaExpanded(false);
  }, []);

  // Voice transcript insertion — same pattern as chat
  const handleTranscript = useCallback((text: string) => {
    if (!text.trim()) return;

    const cursorPos = textareaRef.current?.selectionStart ?? -1;

    setInput((prev) => {
      const pos = cursorPos >= 0 ? Math.min(cursorPos, prev.length) : prev.length;
      const before = prev.slice(0, pos);
      const after = prev.slice(pos);
      const separator = before && !before.endsWith(' ') && !text.startsWith(' ') ? ' ' : '';
      const newInput = before + separator + text + after;
      inputValueRef.current = newInput;

      const newCursorPos = pos + separator.length + text.length;
      setTimeout(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
        setIsTextareaExpanded(textareaRef.current.scrollHeight > lineHeight * 2);
      }, 0);

      return newInput;
    });
  }, []);

  const handleInputFocusChange = useCallback(
    (focused: boolean) => {
      setIsInputFocused(focused);
      onInputFocusChange?.(focused);
    },
    [onInputFocusChange],
  );

  // Stub: renders input as plain text (no @file mention highlights in shell mode)
  const renderInputWithMentions = useCallback((text: string): ReactNode => text, []);

  return {
    input,
    setInput,
    textareaRef,
    inputHighlightRef,
    isTextareaExpanded,
    attachedImages,
    setAttachedImages,
    uploadingImages,
    imageErrors,
    getRootProps,
    getInputProps,
    isDragActive,
    openImagePicker: open,
    handleSubmit,
    handleInputChange,
    handleKeyDown,
    handlePaste,
    handleTextareaClick,
    handleTextareaInput,
    syncInputOverlayScroll,
    handleClearInput,
    handleTranscript,
    handleRemoveImage,
    handleInputFocusChange,
    isInputFocused,
    renderInputWithMentions,
  };
}
