import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { VoiceDebugEntry } from '../../../../hooks/useVoiceInput';
import type { PermissionMode } from '../../../chat/types/types';
import ChatComposer from '../../../chat/view/subcomponents/ChatComposer';
import type { useShellComposerState } from '../../hooks/useShellComposerState';

type ShellComposerStateReturn = ReturnType<typeof useShellComposerState>;

interface ShellComposerProps extends ShellComposerStateReturn {
  // Provider / model / thinking / permission controls
  provider: string;
  claudeModel: string;
  onClaudeModelChange: (model: string) => void;
  thinkingMode: string;
  setThinkingMode: Dispatch<SetStateAction<string>>;
  permissionMode: string;
  onSetPermissionMode: (mode: PermissionMode) => void;
  // Voice
  isVoiceRecording: boolean;
  isVoiceSupported: boolean;
  isVoiceEnabled: boolean;
  voiceError: string | null;
  voiceDebugLog: VoiceDebugEntry[];
  voiceShowDebug: boolean;
  onToggleVoiceRecording: () => void;
  // Flag
  flagMode: boolean;
  flagTriggered: boolean;
  onToggleFlag: () => void;
  // Misc
  sendByCtrlEnter?: boolean;
  wsRef: MutableRefObject<WebSocket | null>;
  sendInput: (data: string) => void;
}

// No-op stubs for chat-only features
const EMPTY_ARRAY: never[] = [];
const noop = () => {};
const noopPermission = () => ({ success: false });

export default function ShellComposer({
  // From useShellComposerState
  input,
  textareaRef,
  inputHighlightRef,
  isTextareaExpanded,
  attachedImages,
  uploadingImages,
  imageErrors,
  getRootProps,
  getInputProps,
  isDragActive,
  openImagePicker,
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
  // Controls
  provider,
  claudeModel,
  onClaudeModelChange,
  thinkingMode,
  setThinkingMode,
  permissionMode,
  onSetPermissionMode,
  // Voice
  isVoiceRecording,
  isVoiceSupported,
  isVoiceEnabled,
  voiceError,
  voiceDebugLog,
  voiceShowDebug,
  onToggleVoiceRecording,
  // Flag
  flagMode,
  flagTriggered,
  onToggleFlag,
  // Misc
  sendByCtrlEnter,
  sendInput,
}: ShellComposerProps) {
  // Shell-specific: send / to open Claude Code's built-in slash menu
  const handleSlashMenu = () => {
    sendInput('/');
  };
  // Shell-specific: send /context to get context usage
  const handleShowContext = () => {
    sendInput('/context');
    setTimeout(() => sendInput('\r'), 60);
  };
  return (
    <ChatComposer
      // Shell-specific overrides
      hideTokenUsage={true}
      onShowContext={handleShowContext}
      // Chat-only features — stubbed
      pendingPermissionRequests={EMPTY_ARRAY}
      handlePermissionDecision={noop}
      handleGrantToolPermission={noopPermission}
      claudeStatus={null}
      isLoading={false}
      onAbortSession={noop}
      tokenBudget={null}
      slashCommandsCount={0}
      onToggleCommandMenu={handleSlashMenu}
      isUserScrolledUp={false}
      hasMessages={false}
      onScrollToBottom={noop}
      showFileDropdown={false}
      filteredFiles={EMPTY_ARRAY}
      selectedFileIndex={-1}
      onSelectFile={noop}
      filteredCommands={EMPTY_ARRAY}
      selectedCommandIndex={-1}
      onCommandSelect={noop}
      onCloseCommandMenu={noop}
      isCommandMenuOpen={false}
      frequentCommands={EMPTY_ARRAY}
      // Real props — controls
      provider={provider}
      claudeModel={claudeModel}
      onClaudeModelChange={onClaudeModelChange}
      thinkingMode={thinkingMode}
      setThinkingMode={setThinkingMode}
      permissionMode={permissionMode}
      onSetPermissionMode={onSetPermissionMode}
      // Flag
      flagMode={flagMode}
      flagTriggered={flagTriggered}
      onToggleFlag={onToggleFlag}
      // Real props — input / form
      hasInput={Boolean(input.trim())}
      onClearInput={handleClearInput}
      onSubmit={handleSubmit}
      isDragActive={isDragActive}
      attachedImages={attachedImages}
      onRemoveImage={handleRemoveImage}
      uploadingImages={uploadingImages}
      imageErrors={imageErrors}
      getRootProps={getRootProps as (...args: unknown[]) => Record<string, unknown>}
      getInputProps={getInputProps as (...args: unknown[]) => Record<string, unknown>}
      openImagePicker={openImagePicker}
      inputHighlightRef={inputHighlightRef}
      renderInputWithMentions={renderInputWithMentions}
      textareaRef={textareaRef}
      input={input}
      onInputChange={handleInputChange}
      onTextareaClick={handleTextareaClick}
      onTextareaKeyDown={handleKeyDown}
      onTextareaPaste={handlePaste}
      onTextareaScrollSync={syncInputOverlayScroll}
      onTextareaInput={handleTextareaInput}
      onInputFocusChange={handleInputFocusChange}
      isInputFocused={isInputFocused}
      placeholder="Type a message or use voice input..."
      isTextareaExpanded={isTextareaExpanded}
      sendByCtrlEnter={sendByCtrlEnter}
      // Voice
      onTranscript={handleTranscript}
      isVoiceRecording={isVoiceRecording}
      isVoiceSupported={isVoiceSupported}
      isVoiceEnabled={isVoiceEnabled}
      voiceError={voiceError}
      voiceDebugLog={voiceDebugLog}
      voiceShowDebug={voiceShowDebug}
      onToggleVoiceRecording={onToggleVoiceRecording}
    />
  );
}
