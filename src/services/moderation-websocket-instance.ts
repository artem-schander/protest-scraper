/**
 * Singleton instance of the ModerationWebSocketService
 * This module avoids circular dependencies by not importing from server.ts
 */

import { ModerationWebSocketService } from './moderation-websocket.js';

let moderationWebSocketInstance: ModerationWebSocketService | null = null;

export function setModerationWebSocket(instance: ModerationWebSocketService): void {
  moderationWebSocketInstance = instance;
}

export function getModerationWebSocket(): ModerationWebSocketService | null {
  return moderationWebSocketInstance;
}
