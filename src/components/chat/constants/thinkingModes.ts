import { Brain, Zap, Sparkles, Atom, Gauge } from 'lucide-react';

// Original thinking modes for non-Claude providers (prefix-based)
export const thinkingModes = [
  {
    id: 'none',
    name: 'Standard',
    description: 'Regular Claude response',
    icon: null,
    prefix: '',
    color: 'text-gray-600'
  },
  {
    id: 'think',
    name: 'Think',
    description: 'Basic extended thinking',
    icon: Brain,
    prefix: 'think',
    color: 'text-blue-600'
  },
  {
    id: 'think-hard',
    name: 'Think Hard',
    description: 'More thorough evaluation',
    icon: Zap,
    prefix: 'think hard',
    color: 'text-purple-600'
  },
  {
    id: 'think-harder',
    name: 'Think Harder',
    description: 'Deep analysis with alternatives',
    icon: Sparkles,
    prefix: 'think harder',
    color: 'text-indigo-600'
  },
  {
    id: 'ultrathink',
    name: 'Ultrathink',
    description: 'Maximum thinking budget',
    icon: Atom,
    prefix: 'ultrathink',
    color: 'text-red-600'
  }
];

// Claude Code SDK effort levels (passed as SDK option, not text prefix)
export const claudeEffortModes = [
  {
    id: 'none',
    name: 'Standard',
    description: 'Default effort level',
    icon: null,
    effort: null as string | null,
    color: 'text-gray-600'
  },
  {
    id: 'low',
    name: 'Low',
    description: 'Minimal thinking, fastest responses',
    icon: Gauge,
    effort: 'low',
    color: 'text-green-600'
  },
  {
    id: 'medium',
    name: 'Medium',
    description: 'Moderate thinking depth',
    icon: Brain,
    effort: 'medium',
    color: 'text-blue-600'
  },
  {
    id: 'high',
    name: 'High',
    description: 'Deep reasoning (default for Claude)',
    icon: Zap,
    effort: 'high',
    color: 'text-purple-600'
  }
];
