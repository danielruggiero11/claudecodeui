import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { PermissionMode } from '../../types/types';

// Shield icon — Default mode
const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

// Pencil icon — Accept Edits mode
const PencilIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

// Lightning bolt icon — Bypass Permissions mode
const LightningIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

// Clipboard icon — Plan mode
const ClipboardIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
    />
  </svg>
);

type ModeIconComponent = (props: { className?: string }) => JSX.Element;

interface ModeConfig {
  id: PermissionMode;
  name: string;
  description: string;
  Icon: ModeIconComponent;
  color: string;
  bgColor: string;
}

const PERMISSION_MODES: ModeConfig[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Ask for permission before each action',
    Icon: ShieldIcon,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600',
  },
  {
    id: 'acceptEdits',
    name: 'Accept Edits',
    description: 'Auto-accept file edits without prompting',
    Icon: PencilIcon,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60',
  },
  {
    id: 'bypassPermissions',
    name: 'Bypass Permissions',
    description: 'Skip all permission checks (use with caution)',
    Icon: LightningIcon,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/40 dark:hover:bg-orange-900/60',
  },
  {
    id: 'plan',
    name: 'Plan Mode',
    description: 'Plan actions before executing, no auto-edits',
    Icon: ClipboardIcon,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60',
  },
];

type PermissionModeSelectorProps = {
  permissionMode: PermissionMode | string;
  onModeSelect: (mode: PermissionMode) => void;
  provider?: string;
  className?: string;
};

export default function PermissionModeSelector({
  permissionMode,
  onModeSelect,
  provider,
  className = '',
}: PermissionModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Codex doesn't support plan mode
  const availableModes = provider === 'codex' ? PERMISSION_MODES.filter((m) => m.id !== 'plan') : PERMISSION_MODES;

  const currentMode = PERMISSION_MODES.find((m) => m.id === permissionMode) || PERMISSION_MODES[0];
  const { Icon: CurrentIcon } = currentMode;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 sm:h-10 sm:w-10 ${currentMode.bgColor}`}
        title={`Permission: ${currentMode.name}`}
      >
        <CurrentIcon className={`h-5 w-5 ${currentMode.color}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Permission Mode</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Control how Claude handles tool permissions</p>
          </div>

          <div className="py-1">
            {availableModes.map((mode) => {
              const { Icon: ModeIcon } = mode;
              const isSelected = mode.id === permissionMode;

              return (
                <button
                  key={mode.id}
                  onClick={() => {
                    onModeSelect(mode.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    isSelected ? 'bg-gray-50 dark:bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${mode.color}`}>
                      <ModeIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {mode.name}
                        </span>
                        {isSelected && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{mode.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
