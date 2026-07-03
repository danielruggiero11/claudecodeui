/**
 * Settings Sync Layer
 *
 * Server is source of truth. localStorage is a write-through cache.
 * On save: write to server, then update localStorage cache + legacy keys.
 * On load: fetch from server, populate cache + legacy keys.
 * Migration: on first load after upgrade, existing localStorage data is sent to server.
 */

import { authenticatedFetch } from './api';

// ── Types ─────────────────────────────────────────────────────────────

export interface PersistedSettings {
  claude: {
    allowedTools: string[];
    disallowedTools: string[];
    skipPermissions: boolean;
  };
  cursor: {
    allowedCommands: string[];
    disallowedCommands: string[];
    skipPermissions: boolean;
  };
  codex: {
    permissionMode: string;
  };
  gemini: {
    permissionMode: string;
  };
  defaultPermissionMode: string;
  uiPreferences: {
    autoExpandTools: boolean;
    showRawParameters: boolean;
    showThinking: boolean;
    autoScrollToBottom: boolean;
    sendByCtrlEnter: boolean;
    sidebarVisible: boolean;
    enhancedShellInput: boolean;
    enhancedShellInputActive: boolean;
    voiceStopOnSend: boolean;
  };
  codeEditor: {
    theme: string;
    wordWrap: boolean;
    showMinimap: boolean;
    lineNumbers: boolean;
    fontSize: string;
  };
  models: {
    claude: string;
    cursor: string;
    codex: string;
    gemini: string;
  };
  defaultEffort: string;
  enabledProviders: {
    claude: boolean;
    cursor: boolean;
    codex: boolean;
    gemini: boolean;
  };
  defaultTab: string;
  mobileShowSidebarOnLaunch: boolean;
  selectedProvider: string;
  projectSortOrder: string;
  theme: string;
  userLanguage: string;
  voiceSettings: Record<string, unknown>;
  gitAutoStageAll: boolean;
  starredProjects: string[];
  claudeUsage?: {
    enabled: boolean;
    chromeProfilePath: string;
  };
  _version: number;
  _migratedAt?: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const SETTINGS_CACHE_KEY = 'user-settings-cache';

// ── Cache (synchronous reads) ─────────────────────────────────────────

export function getCachedSettings(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Server communication ──────────────────────────────────────────────

export async function fetchSettings(): Promise<PersistedSettings> {
  const response = await authenticatedFetch('/api/settings/user-preferences');
  if (!response.ok) throw new Error('Failed to fetch settings');
  const data = await response.json();
  const settings = data.settings as PersistedSettings;
  localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  writeLegacyKeys(settings);
  return settings;
}

export async function saveSettingsToServer(settings: PersistedSettings): Promise<PersistedSettings> {
  const response = await authenticatedFetch('/api/settings/user-preferences', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error('Failed to save settings');
  const data = await response.json();
  const saved = data.settings as PersistedSettings;
  localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(saved));
  writeLegacyKeys(saved);
  return saved;
}

// ── Session permission helpers ────────────────────────────────────────

export async function fetchSessionPermission(sessionId: string): Promise<string | null> {
  try {
    const response = await authenticatedFetch(
      `/api/settings/session-permission/${encodeURIComponent(sessionId)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.permissionMode || null;
  } catch {
    return null;
  }
}

export async function saveSessionPermission(sessionId: string, mode: string): Promise<void> {
  try {
    await authenticatedFetch(
      `/api/settings/session-permission/${encodeURIComponent(sessionId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissionMode: mode }),
      }
    );
    // Also write legacy key for backward compat
    localStorage.setItem(`permissionMode-${sessionId}`, mode);
  } catch {
    // Silently fail — localStorage already has the value
  }
}

// ── Legacy localStorage keys (backward compat) ───────────────────────

function writeLegacyKeys(settings: PersistedSettings): void {
  try {
    // Permission settings
    localStorage.setItem('claude-settings', JSON.stringify({
      allowedTools: settings.claude.allowedTools,
      disallowedTools: settings.claude.disallowedTools,
      skipPermissions: settings.claude.skipPermissions,
      projectSortOrder: settings.projectSortOrder,
      lastUpdated: new Date().toISOString(),
    }));
    localStorage.setItem('cursor-tools-settings', JSON.stringify({
      allowedCommands: settings.cursor.allowedCommands,
      disallowedCommands: settings.cursor.disallowedCommands,
      skipPermissions: settings.cursor.skipPermissions,
      lastUpdated: new Date().toISOString(),
    }));
    localStorage.setItem('codex-settings', JSON.stringify({
      permissionMode: settings.codex.permissionMode,
      lastUpdated: new Date().toISOString(),
    }));
    localStorage.setItem('gemini-settings', JSON.stringify({
      permissionMode: settings.gemini.permissionMode,
      lastUpdated: new Date().toISOString(),
    }));
    localStorage.setItem('default-permission-mode', settings.defaultPermissionMode);

    // UI preferences
    localStorage.setItem('uiPreferences', JSON.stringify(settings.uiPreferences));

    // Provider & model selections
    localStorage.setItem('selected-provider', settings.selectedProvider);
    if (settings.models.claude) localStorage.setItem('claude-model', settings.models.claude);
    if (settings.models.cursor) localStorage.setItem('cursor-model', settings.models.cursor);
    if (settings.models.codex) localStorage.setItem('codex-model', settings.models.codex);
    if (settings.models.gemini) localStorage.setItem('gemini-model', settings.models.gemini);
    if (settings.defaultEffort) localStorage.setItem('claude-default-effort', settings.defaultEffort);

    // Code editor settings
    localStorage.setItem('codeEditorTheme', settings.codeEditor.theme);
    localStorage.setItem('codeEditorWordWrap', String(settings.codeEditor.wordWrap));
    localStorage.setItem('codeEditorShowMinimap', String(settings.codeEditor.showMinimap));
    localStorage.setItem('codeEditorLineNumbers', String(settings.codeEditor.lineNumbers));
    localStorage.setItem('codeEditorFontSize', settings.codeEditor.fontSize);

    // Provider enable/disable & default tab
    if (settings.enabledProviders) {
      localStorage.setItem('enabledProviders', JSON.stringify(settings.enabledProviders));
    }
    if (settings.defaultTab) {
      localStorage.setItem('defaultTab', settings.defaultTab);
    }
    localStorage.setItem('mobileShowSidebarOnLaunch', String(settings.mobileShowSidebarOnLaunch ?? true));

    // Other preferences
    localStorage.setItem('theme', settings.theme);
    localStorage.setItem('userLanguage', settings.userLanguage);
    if (settings.voiceSettings && Object.keys(settings.voiceSettings).length > 0) {
      localStorage.setItem('voice-settings', JSON.stringify(settings.voiceSettings));
    }
    localStorage.setItem('gitAutoStageAll', String(settings.gitAutoStageAll ?? false));
    localStorage.setItem('starredProjects', JSON.stringify(settings.starredProjects));
  } catch {
    // Best-effort — localStorage might be full
  }
}

// ── Migration from localStorage to server ─────────────────────────────

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function buildSettingsFromLocalStorage(): Partial<PersistedSettings> {
  const claude = safeParseJson(localStorage.getItem('claude-settings'), {} as Record<string, unknown>);
  const cursor = safeParseJson(localStorage.getItem('cursor-tools-settings'), {} as Record<string, unknown>);
  const codex = safeParseJson(localStorage.getItem('codex-settings'), {} as Record<string, unknown>);
  const gemini = safeParseJson(localStorage.getItem('gemini-settings'), {} as Record<string, unknown>);
  const uiPrefs = safeParseJson(localStorage.getItem('uiPreferences'), {} as Record<string, unknown>);
  const voiceSettings = safeParseJson(localStorage.getItem('voice-settings'), {} as Record<string, unknown>);
  const starredProjects = safeParseJson(localStorage.getItem('starredProjects'), [] as string[]);

  return {
    claude: {
      allowedTools: (claude.allowedTools as string[]) || [],
      disallowedTools: (claude.disallowedTools as string[]) || [],
      skipPermissions: Boolean(claude.skipPermissions),
    },
    cursor: {
      allowedCommands: (cursor.allowedCommands as string[]) || [],
      disallowedCommands: (cursor.disallowedCommands as string[]) || [],
      skipPermissions: Boolean(cursor.skipPermissions),
    },
    codex: {
      permissionMode: (codex.permissionMode as string) || 'default',
    },
    gemini: {
      permissionMode: (gemini.permissionMode as string) || 'default',
    },
    defaultPermissionMode: localStorage.getItem('default-permission-mode') || 'default',
    uiPreferences: {
      autoExpandTools: uiPrefs.autoExpandTools === true,
      showRawParameters: uiPrefs.showRawParameters === true,
      showThinking: uiPrefs.showThinking !== false,
      autoScrollToBottom: uiPrefs.autoScrollToBottom !== false,
      sendByCtrlEnter: uiPrefs.sendByCtrlEnter === true,
      sidebarVisible: uiPrefs.sidebarVisible !== false,
      enhancedShellInput: uiPrefs.enhancedShellInput === true,
      enhancedShellInputActive: uiPrefs.enhancedShellInputActive !== false,
      voiceStopOnSend: uiPrefs.voiceStopOnSend !== false,
    },
    codeEditor: {
      theme: localStorage.getItem('codeEditorTheme') || 'dark',
      wordWrap: localStorage.getItem('codeEditorWordWrap') === 'true',
      showMinimap: localStorage.getItem('codeEditorShowMinimap') !== 'false',
      lineNumbers: localStorage.getItem('codeEditorLineNumbers') !== 'false',
      fontSize: localStorage.getItem('codeEditorFontSize') || '14',
    },
    models: {
      claude: localStorage.getItem('claude-model') || '',
      cursor: localStorage.getItem('cursor-model') || '',
      codex: localStorage.getItem('codex-model') || '',
      gemini: localStorage.getItem('gemini-model') || '',
    },
    enabledProviders: safeParseJson(localStorage.getItem('enabledProviders'), {
      claude: true,
      cursor: true,
      codex: true,
      gemini: true,
    }),
    defaultTab: localStorage.getItem('defaultTab') || 'chat',
    mobileShowSidebarOnLaunch: localStorage.getItem('mobileShowSidebarOnLaunch') !== 'false',
    defaultEffort: localStorage.getItem('claude-default-effort') || 'high',
    selectedProvider: localStorage.getItem('selected-provider') || 'claude',
    projectSortOrder: (claude.projectSortOrder as string) || 'name',
    theme: localStorage.getItem('theme') || 'dark',
    userLanguage: localStorage.getItem('userLanguage') || 'en',
    gitAutoStageAll: localStorage.getItem('gitAutoStageAll') === 'true',
    voiceSettings,
    starredProjects,
    _version: 1,
    _migratedAt: new Date().toISOString(),
  };
}

export async function migrateIfNeeded(): Promise<PersistedSettings> {
  const serverSettings = await fetchSettings();

  if (serverSettings._migratedAt) {
    // Already migrated — server is authoritative
    return serverSettings;
  }

  // First time: check if localStorage has any existing data worth migrating
  const hasLocalData = localStorage.getItem('claude-settings') ||
    localStorage.getItem('cursor-tools-settings') ||
    localStorage.getItem('codex-settings') ||
    localStorage.getItem('uiPreferences') ||
    localStorage.getItem('theme');

  if (!hasLocalData) {
    // No existing data — just mark as migrated with defaults
    const withMigration = { ...serverSettings, _migratedAt: new Date().toISOString() };
    return saveSettingsToServer(withMigration);
  }

  // Merge localStorage data into server defaults
  const localSettings = buildSettingsFromLocalStorage();
  const merged = { ...serverSettings, ...localSettings } as PersistedSettings;
  return saveSettingsToServer(merged);
}

// ── Partial update helper ─────────────────────────────────────────────

/**
 * Read current cached settings, apply a partial update, and save to server.
 * Useful for components that only know about one slice of settings.
 */
export async function updateSettingsPartial(
  patch: Partial<PersistedSettings>
): Promise<PersistedSettings> {
  const current = getCachedSettings();
  if (!current) {
    // No cache yet — fetch first
    const fresh = await fetchSettings();
    const merged = { ...fresh, ...patch };
    return saveSettingsToServer(merged);
  }
  const merged = { ...current, ...patch };
  return saveSettingsToServer(merged);
}
