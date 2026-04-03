import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { CLAUDE_MODELS } from '../../../../../shared/modelConstants';

// Musical note icon for Sonnet family
const MusicNoteIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

// Star icon for Opus family
const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

// Diamond icon for Haiku (small, fast)
const DiamondIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 12l10 10 10-10L12 2z" />
  </svg>
);

type ModelIconComponent = (props: { className?: string }) => JSX.Element;

interface ModelConfig {
  Icon: ModelIconComponent;
  color: string;
  bgColor: string;
  haloColor?: string; // ring around button for 1M variants
  description: string;
}

const MODEL_CONFIG: Record<string, ModelConfig> = {
  sonnet: {
    Icon: MusicNoteIcon,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800',
    description: 'Fast and capable, best for most tasks',
  },
  'sonnet[1m]': {
    Icon: MusicNoteIcon,
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 hover:bg-cyan-200 dark:bg-cyan-900 dark:hover:bg-cyan-800',
    haloColor: 'ring-2 ring-cyan-400 ring-offset-1 dark:ring-cyan-500 dark:ring-offset-gray-900',
    description: 'Sonnet with 1M token context window',
  },
  opus: {
    Icon: StarIcon,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 hover:bg-purple-200 dark:bg-purple-900 dark:hover:bg-purple-800',
    description: 'Most powerful, for complex tasks',
  },
  'opus[1m]': {
    Icon: StarIcon,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-100 hover:bg-violet-200 dark:bg-violet-900 dark:hover:bg-violet-800',
    haloColor: 'ring-2 ring-violet-400 ring-offset-1 dark:ring-violet-500 dark:ring-offset-gray-900',
    description: 'Opus with 1M token context window',
  },
  opusplan: {
    Icon: StarIcon,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900 dark:hover:bg-amber-800',
    description: 'Opus optimized for planning tasks',
  },
  haiku: {
    Icon: DiamondIcon,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800',
    description: 'Fastest and most compact',
  },
};

const DEFAULT_CONFIG: ModelConfig = {
  Icon: MusicNoteIcon,
  color: 'text-blue-600 dark:text-blue-400',
  bgColor: 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800',
  description: 'Claude model',
};

type ModelSelectorProps = {
  selectedModel: string;
  onModelChange: (model: string) => void;
  className?: string;
};

export default function ModelSelector({ selectedModel, onModelChange, className = '' }: ModelSelectorProps) {
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

  const currentConfig = MODEL_CONFIG[selectedModel] || DEFAULT_CONFIG;
  const { Icon: CurrentIcon } = currentConfig;
  const currentLabel = CLAUDE_MODELS.OPTIONS.find((m) => m.value === selectedModel)?.label || selectedModel;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 sm:h-10 sm:w-10 ${currentConfig.bgColor} ${currentConfig.haloColor || ''}`}
        title={`Model: ${currentLabel}`}
      >
        <CurrentIcon className={`h-5 w-5 ${currentConfig.color}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Claude Model</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select the model for this session</p>
          </div>

          <div className="py-1">
            {CLAUDE_MODELS.OPTIONS.map((model) => {
              const config = MODEL_CONFIG[model.value] || DEFAULT_CONFIG;
              const { Icon: ModelIcon } = config;
              const isSelected = model.value === selectedModel;

              return (
                <button
                  key={model.value}
                  onClick={() => {
                    onModelChange(model.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    isSelected ? 'bg-gray-50 dark:bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${config.color} ${config.haloColor ? 'ring-2 ring-current/30 ring-offset-1' : ''}`}>
                      <ModelIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {model.label}
                        </span>
                        {isSelected && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{config.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Tip:</strong> Sonnet is fastest; Opus gives the deepest reasoning
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
