import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { VoiceDebugEntry } from '../../../../hooks/useVoiceInput';
import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
  SetStateAction,
  TouchEvent,
} from 'react';
import type { PendingPermissionRequest, PermissionMode, Provider } from '../../types/types';
import CommandMenu from './CommandMenu';
import ClaudeStatus from './ClaudeStatus';
import ImageAttachment from './ImageAttachment';
import PermissionRequestsBanner from './PermissionRequestsBanner';
import ChatInputControls from './ChatInputControls';

interface MentionableFile {
  name: string;
  path: string;
}

interface SlashCommand {
  name: string;
  description?: string;
  namespace?: string;
  path?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ChatComposerProps {
  pendingPermissionRequests: PendingPermissionRequest[];
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  handleGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
  claudeStatus: { text: string; tokens: number; can_interrupt: boolean } | null;
  isLoading: boolean;
  onAbortSession: () => void;
  provider: Provider | string;
  permissionMode: PermissionMode | string;
  onSetPermissionMode: (mode: PermissionMode) => void;
  claudeModel: string;
  onClaudeModelChange: (model: string) => void;
  thinkingMode: string;
  setThinkingMode: Dispatch<SetStateAction<string>>;
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
  onSubmit: (event: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>) => void;
  isDragActive: boolean;
  attachedImages: File[];
  onRemoveImage: (index: number) => void;
  uploadingImages: Map<string, number>;
  imageErrors: Map<string, string>;
  showFileDropdown: boolean;
  filteredFiles: MentionableFile[];
  selectedFileIndex: number;
  onSelectFile: (file: MentionableFile) => void;
  filteredCommands: SlashCommand[];
  selectedCommandIndex: number;
  onCommandSelect: (command: SlashCommand, index: number, isHover: boolean) => void;
  onCloseCommandMenu: () => void;
  isCommandMenuOpen: boolean;
  frequentCommands: SlashCommand[];
  getRootProps: (...args: unknown[]) => Record<string, unknown>;
  getInputProps: (...args: unknown[]) => Record<string, unknown>;
  openImagePicker: () => void;
  inputHighlightRef: RefObject<HTMLDivElement>;
  renderInputWithMentions: (text: string) => ReactNode;
  textareaRef: RefObject<HTMLTextAreaElement>;
  input: string;
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onTextareaClick: (event: MouseEvent<HTMLTextAreaElement>) => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTextareaScrollSync: (target: HTMLTextAreaElement) => void;
  onTextareaInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onInputFocusChange?: (focused: boolean) => void;
  isInputFocused?: boolean;
  placeholder: string;
  isTextareaExpanded: boolean;
  sendByCtrlEnter?: boolean;
  onTranscript: (text: string) => void;
  isVoiceRecording: boolean;
  isVoiceSupported: boolean;
  isVoiceEnabled: boolean;
  voiceError: string | null;
  voiceDebugLog: VoiceDebugEntry[];
  voiceShowDebug: boolean;
  onToggleVoiceRecording: () => void;
}

export default function ChatComposer({
  pendingPermissionRequests,
  handlePermissionDecision,
  handleGrantToolPermission,
  claudeStatus,
  isLoading,
  onAbortSession,
  provider,
  permissionMode,
  onSetPermissionMode,
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
  onSubmit,
  isDragActive,
  attachedImages,
  onRemoveImage,
  uploadingImages,
  imageErrors,
  showFileDropdown,
  filteredFiles,
  selectedFileIndex,
  onSelectFile,
  filteredCommands,
  selectedCommandIndex,
  onCommandSelect,
  onCloseCommandMenu,
  isCommandMenuOpen,
  frequentCommands,
  getRootProps,
  getInputProps,
  openImagePicker,
  inputHighlightRef,
  renderInputWithMentions,
  textareaRef,
  input,
  onInputChange,
  onTextareaClick,
  onTextareaKeyDown,
  onTextareaPaste,
  onTextareaScrollSync,
  onTextareaInput,
  onInputFocusChange,
  isInputFocused,
  placeholder,
  isTextareaExpanded,
  sendByCtrlEnter,
  onTranscript,
  isVoiceRecording,
  isVoiceSupported,
  isVoiceEnabled,
  voiceError,
  voiceDebugLog,
  voiceShowDebug,
  onToggleVoiceRecording,
}: ChatComposerProps) {
  const { t } = useTranslation('chat');
  const debugScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debugScrollRef.current) {
      debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight;
    }
  }, [voiceDebugLog]);
  const textareaRect = textareaRef.current?.getBoundingClientRect();
  const commandMenuPosition = {
    top: textareaRect ? Math.max(16, textareaRect.top - 316) : 0,
    left: textareaRect ? textareaRect.left : 16,
    bottom: textareaRect ? window.innerHeight - textareaRect.top + 8 : 90,
  };

  // Detect if the AskUserQuestion interactive panel is active
  const hasQuestionPanel = pendingPermissionRequests.some(
    (r) => r.toolName === 'AskUserQuestion'
  );

  // On mobile, when input is focused, float the input box at the bottom
  const mobileFloatingClass = isInputFocused
    ? 'max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:z-50 max-sm:bg-background max-sm:shadow-[0_-4px_20px_rgba(0,0,0,0.15)]'
    : '';

  return (
    <div className={`flex-shrink-0 p-2 pb-2 sm:p-4 sm:pb-4 md:p-4 md:pb-6 ${mobileFloatingClass}`}>
      {!hasQuestionPanel && (
        <div className="flex-1">
          <ClaudeStatus
            status={claudeStatus}
            isLoading={isLoading}
            onAbort={onAbortSession}
            provider={provider}
          />
        </div>
      )}

      <div className="mx-auto mb-3 max-w-4xl">
        <PermissionRequestsBanner
          pendingPermissionRequests={pendingPermissionRequests}
          handlePermissionDecision={handlePermissionDecision}
          handleGrantToolPermission={handleGrantToolPermission}
        />

        {!hasQuestionPanel && <ChatInputControls
          permissionMode={permissionMode}
          onSetPermissionMode={onSetPermissionMode}
          provider={provider}
          claudeModel={claudeModel}
          onClaudeModelChange={onClaudeModelChange}
          thinkingMode={thinkingMode}
          setThinkingMode={setThinkingMode}
          tokenBudget={tokenBudget}
          slashCommandsCount={slashCommandsCount}
          onToggleCommandMenu={onToggleCommandMenu}
          hasInput={hasInput}
          onClearInput={onClearInput}
          isUserScrolledUp={isUserScrolledUp}
          hasMessages={hasMessages}
          onScrollToBottom={onScrollToBottom}
          flagMode={flagMode}
          flagTriggered={flagTriggered}
          onToggleFlag={onToggleFlag}
        />}
      </div>

      {voiceShowDebug && voiceDebugLog.length > 0 && (
        <div className="mx-auto mb-2 max-w-4xl">
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/20 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-yellow-400">Voice Debug</span>
              <button
                type="button"
                onClick={() => {
                  const text = voiceDebugLog
                    .map((e) => `${new Date(e.ts).toISOString().slice(11, 23)} [${e.type}] ${e.detail}`)
                    .join('\n');
                  navigator.clipboard.writeText(text).then(() => {
                    alert('Debug log copied!');
                  });
                }}
                className="rounded bg-yellow-600/40 px-2 py-0.5 font-mono text-[10px] text-yellow-200 active:bg-yellow-600/60"
              >
                Copy Log
              </button>
            </div>
            <div
              ref={debugScrollRef}
              className="max-h-48 overflow-y-auto font-mono text-[10px] leading-tight text-yellow-200/80"
            >
              {voiceDebugLog.map((entry, i) => (
                <div key={i} className="border-b border-yellow-500/10 py-0.5">
                  <span className="text-yellow-500/60">{new Date(entry.ts).toISOString().slice(11, 23)}</span>
                  {' '}
                  <span className={
                    entry.type === 'onresult' ? 'text-cyan-300' :
                    entry.type === 'final' ? 'text-green-300' :
                    entry.type === 'emit-interim' ? 'text-orange-300' :
                    entry.type === 'parsed' ? 'text-blue-300' :
                    'text-yellow-200'
                  }>[{entry.type}]</span>
                  {' '}
                  {entry.detail}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!hasQuestionPanel && <form onSubmit={onSubmit as (event: FormEvent<HTMLFormElement>) => void} className="relative mx-auto max-w-4xl">
        {isDragActive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/15">
            <div className="rounded-xl border border-border/30 bg-card p-4 shadow-lg">
              <svg className="mx-auto mb-2 h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm font-medium">Drop images here</p>
            </div>
          </div>
        )}

        {attachedImages.length > 0 && (
          <div className="mb-2 rounded-xl bg-muted/40 p-2">
            <div className="flex flex-wrap gap-2">
              {attachedImages.map((file, index) => (
                <ImageAttachment
                  key={index}
                  file={file}
                  onRemove={() => onRemoveImage(index)}
                  uploadProgress={uploadingImages.get(file.name)}
                  error={imageErrors.get(file.name)}
                />
              ))}
            </div>
          </div>
        )}

        {showFileDropdown && filteredFiles.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border/50 bg-card/95 shadow-lg backdrop-blur-md">
            {filteredFiles.map((file, index) => (
              <div
                key={file.path}
                className={`cursor-pointer touch-manipulation border-b border-border/30 px-4 py-3 last:border-b-0 ${
                  index === selectedFileIndex
                    ? 'bg-primary/8 text-primary'
                    : 'text-foreground hover:bg-accent/50'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectFile(file);
                }}
              >
                <div className="text-sm font-medium">{file.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{file.path}</div>
              </div>
            ))}
          </div>
        )}

        <CommandMenu
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={onCommandSelect}
          onClose={onCloseCommandMenu}
          position={commandMenuPosition}
          isOpen={isCommandMenuOpen}
          frequentCommands={frequentCommands}
        />

        <div
            {...getRootProps()}
            className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm transition-colors duration-200 focus-within:border-primary/30 ${
              isTextareaExpanded ? 'chat-input-expanded' : ''
            }`}
          >
            <input {...getInputProps()} />
            <div ref={inputHighlightRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="chat-input-placeholder block w-full whitespace-pre-wrap break-words py-1.5 pl-12 pr-20 text-base leading-6 text-transparent sm:py-4 sm:pr-40">
                {renderInputWithMentions(input)}
              </div>
            </div>

            <div className="relative z-10">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={onInputChange}
                onClick={onTextareaClick}
                onKeyDown={onTextareaKeyDown}
                onPaste={onTextareaPaste}
                onScroll={(event) => onTextareaScrollSync(event.target as HTMLTextAreaElement)}
                onFocus={() => onInputFocusChange?.(true)}
                onBlur={() => onInputFocusChange?.(false)}
                onInput={onTextareaInput}
                placeholder={placeholder}
                className="chat-input-placeholder block max-h-[40vh] min-h-[50px] w-full resize-none overflow-y-auto rounded-2xl bg-transparent py-1.5 pl-12 pr-20 text-base leading-6 text-foreground placeholder-muted-foreground/50 focus:outline-none sm:max-h-[300px] sm:min-h-[80px] sm:py-4 sm:pr-40"
                style={{ height: '50px' }}
              />

              <button
                type="button"
                onClick={openImagePicker}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-xl p-2 transition-colors hover:bg-accent/60"
                title={t('input.attachImages')}
              >
                <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>

            {isVoiceEnabled && isVoiceSupported && !isVoiceRecording && (
              <button
                key="mic-off"
                type="button"
                onTouchStart={(e) => e.stopPropagation()}
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleVoiceRecording();
                }}
                style={{ top: 0, bottom: 0, margin: 'auto 0' }}
                className="absolute right-14 z-20 flex h-8 w-8 touch-manipulation items-center justify-center rounded-lg text-muted-foreground outline-none sm:right-16 sm:h-9 sm:w-9"
                aria-label="Start voice input"
              >
                <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {isVoiceEnabled && isVoiceSupported && isVoiceRecording && (
              <button
                key="mic-on"
                type="button"
                onTouchStart={(e) => e.stopPropagation()}
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleVoiceRecording();
                }}
                style={{ top: 0, bottom: 0, margin: 'auto 0', backgroundColor: '#ef4444', color: '#fff' }}
                className="absolute right-14 z-20 flex h-8 w-8 touch-manipulation items-center justify-center rounded-lg outline-none sm:right-16 sm:h-9 sm:w-9"
                aria-label="Stop listening"
              >
                <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

              <button
                type="submit"
              disabled={!input.trim() || isLoading}
              onMouseDown={(event) => {
                event.preventDefault();
                onSubmit(event);
              }}
              onTouchStart={(event) => {
                event.preventDefault();
                onSubmit(event);
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-primary hover:bg-primary/90 focus:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground sm:h-11 sm:w-11"
            >
              <svg className="h-4 w-4 rotate-90 text-primary-foreground sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>

            {voiceError && (
              <div className="pointer-events-none absolute bottom-1 left-12 right-14 truncate text-xs text-red-400 sm:right-40">
                {voiceError}
              </div>
            )}

            {!voiceError && (
              <div
                className={`pointer-events-none absolute bottom-1 left-12 right-14 hidden text-xs text-muted-foreground/50 transition-opacity duration-200 sm:right-40 sm:block ${
                  input.trim() && !isVoiceRecording ? 'opacity-0' : 'opacity-100'
                }`}
              >
                {isVoiceRecording
                  ? 'Listening...'
                  : sendByCtrlEnter ? t('input.hintText.ctrlEnter') : t('input.hintText.enter')}
              </div>
            )}
          </div>
        </div>
      </form>}
    </div>
  );
}
