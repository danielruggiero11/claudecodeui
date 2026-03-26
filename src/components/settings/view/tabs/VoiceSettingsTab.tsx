import type { VoiceSettings, VoiceSendMode } from '../../../../hooks/useVoiceInput';
import SettingsCard from '../SettingsCard';
import SettingsRow from '../SettingsRow';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';

type VoiceSettingsTabProps = {
  voiceSettings: VoiceSettings;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
};

export default function VoiceSettingsTab({
  voiceSettings,
  onVoiceSettingsChange,
}: VoiceSettingsTabProps) {
  const update = (patch: Partial<VoiceSettings>) => {
    onVoiceSettingsChange({ ...voiceSettings, ...patch });
  };

  return (
    <div className="space-y-8">
      <SettingsSection title="Voice Input">
        <SettingsCard divided>
          <SettingsRow
            label="Enable Voice Input"
            description="Show the microphone button in the chat input"
          >
            <SettingsToggle
              checked={voiceSettings.enabled}
              onChange={(value) => update({ enabled: value })}
              ariaLabel="Enable voice input"
            />
          </SettingsRow>

          <SettingsRow
            label="Auto-Start Recording"
            description="Automatically start listening when opening a chat"
          >
            <SettingsToggle
              checked={voiceSettings.autoStart}
              onChange={(value) => update({ autoStart: value })}
              ariaLabel="Auto-start recording"
              disabled={!voiceSettings.enabled}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Send Behavior">
        <SettingsCard divided>
          <SettingsRow
            label="Send Mode"
            description="How transcribed text gets sent"
          >
            <select
              value={voiceSettings.sendMode}
              onChange={(e) => update({ sendMode: e.target.value as VoiceSendMode })}
              disabled={!voiceSettings.enabled}
              className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44 disabled:opacity-50"
            >
              <option value="manual">Manual (click Send)</option>
              <option value="voiceCommand">Voice Command</option>
              <option value="autoPause">Auto-Send on Pause</option>
            </select>
          </SettingsRow>

          {voiceSettings.sendMode === 'voiceCommand' && (
            <SettingsRow
              label="Send Command Phrase"
              description="Say this phrase to send the message (case-insensitive)"
            >
              <input
                type="text"
                value={voiceSettings.sendCommandPhrase}
                onChange={(e) => update({ sendCommandPhrase: e.target.value })}
                disabled={!voiceSettings.enabled}
                placeholder="e.g. send message"
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44 disabled:opacity-50"
              />
            </SettingsRow>
          )}

          {voiceSettings.sendMode === 'autoPause' && (
            <SettingsRow
              label="Auto-Send Delay"
              description="How long to wait after you stop speaking before sending"
            >
              <select
                value={voiceSettings.autoSendDelay}
                onChange={(e) => update({ autoSendDelay: Number(e.target.value) })}
                disabled={!voiceSettings.enabled}
                className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44 disabled:opacity-50"
              >
                <option value={1500}>1.5 seconds</option>
                <option value={2000}>2 seconds</option>
                <option value={3000}>3 seconds</option>
                <option value={5000}>5 seconds</option>
              </select>
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Recognition">
        <SettingsCard>
          <SettingsRow
            label="Language"
            description="Speech recognition language"
          >
            <select
              value={voiceSettings.language}
              onChange={(e) => update({ language: e.target.value })}
              disabled={!voiceSettings.enabled}
              className="w-full rounded-lg border border-input bg-card p-2.5 text-sm text-foreground touch-manipulation focus:border-primary focus:ring-1 focus:ring-primary sm:w-44 disabled:opacity-50"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-AU">English (AU)</option>
              <option value="es-ES">Spanish</option>
              <option value="fr-FR">French</option>
              <option value="de-DE">German</option>
              <option value="it-IT">Italian</option>
              <option value="pt-BR">Portuguese (BR)</option>
              <option value="ja-JP">Japanese</option>
              <option value="ko-KR">Korean</option>
              <option value="zh-CN">Chinese (Simplified)</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Click the mic button or use voice settings to start listening</li>
          <li>Speech is continuously transcribed into the chat input</li>
          <li>
            {voiceSettings.sendMode === 'voiceCommand'
              ? `Say "${voiceSettings.sendCommandPhrase}" to send your message`
              : voiceSettings.sendMode === 'autoPause'
                ? `Message sends automatically after ${voiceSettings.autoSendDelay / 1000}s of silence`
                : 'Click the Send button to send your message'}
          </li>
          <li>Requires Chrome or Edge (uses Web Speech API)</li>
        </ul>
      </div>
    </div>
  );
}
