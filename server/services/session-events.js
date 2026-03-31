/**
 * Session lifecycle event bus.
 * Providers emit events here; index.js subscribes and broadcasts to WebSocket clients.
 */
import { EventEmitter } from 'events';

const sessionEvents = new EventEmitter();

/**
 * Emit a session status change.
 * @param {'active' | 'completed' | 'error'} status
 * @param {string} sessionId
 * @param {string} provider - 'claude' | 'cursor' | 'codex' | 'gemini'
 */
export function emitSessionStatus(sessionId, provider, status) {
  sessionEvents.emit('session-status', { sessionId, provider, status, timestamp: Date.now() });
}

/**
 * Subscribe to session status changes.
 * @param {(event: { sessionId: string, provider: string, status: string, timestamp: number }) => void} handler
 */
export function onSessionStatus(handler) {
  sessionEvents.on('session-status', handler);
}

export default sessionEvents;
