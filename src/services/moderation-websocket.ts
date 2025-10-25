import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '@/utils/jwt.js';

interface ModerationClient {
  ws: WebSocket;
  userId: string;
  email: string;
  role: string;
  viewingEvents: Set<string>; // Event IDs this client is viewing
}

interface ModerationMessage {
  type: 'view_event' | 'unview_event' | 'event_updated' | 'event_deleted' | 'ping' | 'request_locks';
  eventId?: string;
  userId?: string;
  email?: string;
}

interface BroadcastMessage {
  type: 'event_locked' | 'event_unlocked' | 'event_updated' | 'event_deleted' | 'event_created' | 'pong';
  eventId?: string;
  lockedBy?: { userId: string; email: string };
}

/**
 * WebSocket service for real-time moderation coordination.
 * Prevents multiple moderators from working on the same event simultaneously.
 */
export class ModerationWebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, ModerationClient> = new Map(); // clientId → client
  private eventLocks: Map<string, string> = new Map(); // eventId → userId who's viewing it

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    // Extract JWT token from cookie
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const token = cookies?.['auth-token'];

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    try {
      const decoded = verifyToken(token);

      // Only allow MODERATOR and ADMIN roles
      if (decoded.role !== 'MODERATOR' && decoded.role !== 'ADMIN') {
        ws.close(4003, 'Insufficient permissions');
        return;
      }

      const clientId = `${decoded.userId}-${Date.now()}`;
      const client: ModerationClient = {
        ws,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        viewingEvents: new Set(),
      };

      this.clients.set(clientId, client);
      console.log(`[WebSocket] Moderator connected: ${client.email} (${clientId})`);

      // Send current locks to new client
      this.sendCurrentLocks(client);

      ws.on('message', (data: string) => {
        this.handleMessage(clientId, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Client error (${clientId}):`, error);
      });

    } catch (error) {
      console.error('[WebSocket] Authentication failed:', error);
      ws.close(4002, 'Invalid token');
    }
  }

  private handleMessage(clientId: string, data: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message: ModerationMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'view_event':
          if (message.eventId) {
            this.handleViewEvent(client, message.eventId, clientId);
          }
          break;

        case 'unview_event':
          if (message.eventId) {
            this.handleUnviewEvent(client, message.eventId);
          }
          break;

        case 'event_updated':
          if (message.eventId) {
            this.broadcastEventUpdate(message.eventId, client.userId);
          }
          break;

        case 'event_deleted':
          if (message.eventId) {
            this.broadcastEventDelete(message.eventId, client.userId);
          }
          break;

        case 'ping':
          // Respond with pong
          this.sendToClient(client, { type: 'pong' });
          break;

        case 'request_locks':
          // Send current locks to requesting client
          console.log(`[WebSocket] Client ${client.email} requested current locks`);
          this.sendCurrentLocks(client);
          break;

        default:
          console.warn(`[WebSocket] Unknown message type: ${(message as any).type}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Failed to parse message from ${clientId}:`, error);
    }
  }

  private handleViewEvent(client: ModerationClient, eventId: string, clientId: string) {
    // Add to client's viewing set
    client.viewingEvents.add(eventId);

    // Check if already locked by someone else
    const lockedBy = this.eventLocks.get(eventId);

    if (!lockedBy) {
      // Lock the event for this user
      this.eventLocks.set(eventId, client.userId);
      console.log(`[WebSocket] Event ${eventId} locked by ${client.email}`);

      // Broadcast lock to all other clients (including same user in different browser)
      this.broadcastExcept({
        type: 'event_locked',
        eventId,
        lockedBy: {
          userId: client.userId,
          email: client.email,
        },
      }, clientId);
    } else if (lockedBy !== client.userId) {
      // Event is locked by someone else, send lock info to this client
      const lockingClient = Array.from(this.clients.values()).find(
        (c) => c.userId === lockedBy
      );

      if (lockingClient) {
        this.sendToClient(client, {
          type: 'event_locked',
          eventId,
          lockedBy: {
            userId: lockingClient.userId,
            email: lockingClient.email,
          },
        });
      }
    }
  }

  private handleUnviewEvent(client: ModerationClient, eventId: string) {
    // Remove from client's viewing set
    client.viewingEvents.delete(eventId);

    // Check if this client was the one locking the event
    const lockedBy = this.eventLocks.get(eventId);
    if (lockedBy === client.userId) {
      // No one else is viewing, unlock
      this.eventLocks.delete(eventId);
      console.log(`[WebSocket] Event ${eventId} unlocked by ${client.email}`);

      // Broadcast unlock to all clients
      this.broadcast({
        type: 'event_unlocked',
        eventId,
      });
    }
  }

  private handleDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`[WebSocket] Moderator disconnected: ${client.email} (${clientId})`);

    // Release all locks held by this client
    for (const eventId of client.viewingEvents) {
      const lockedBy = this.eventLocks.get(eventId);
      if (lockedBy === client.userId) {
        this.eventLocks.delete(eventId);
        console.log(`[WebSocket] Event ${eventId} unlocked (client disconnected)`);

        // Broadcast unlock
        this.broadcast({
          type: 'event_unlocked',
          eventId,
        });
      }
    }

    this.clients.delete(clientId);
  }

  private sendCurrentLocks(client: ModerationClient) {
    // Send all currently locked events to the new client
    for (const [eventId, userId] of this.eventLocks.entries()) {
      const lockingClient = Array.from(this.clients.values()).find(
        (c) => c.userId === userId
      );

      if (lockingClient) {
        this.sendToClient(client, {
          type: 'event_locked',
          eventId,
          lockedBy: {
            userId: lockingClient.userId,
            email: lockingClient.email,
          },
        });
      }
    }
  }

  private sendToClient(client: ModerationClient, message: BroadcastMessage) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: BroadcastMessage, excludeUserId?: string) {
    for (const client of this.clients.values()) {
      if (excludeUserId && client.userId === excludeUserId) {
        continue;
      }
      this.sendToClient(client, message);
    }
  }

  private broadcastExcept(message: BroadcastMessage, excludeClientId?: string) {
    for (const [clientId, client] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }
      this.sendToClient(client, message);
    }
  }

  /**
   * Broadcast that an event was updated (called from API endpoints)
   */
  public broadcastEventUpdate(eventId: string, _updatedBy: string) {
    this.broadcast({
      type: 'event_updated',
      eventId,
    });
  }

  /**
   * Broadcast that an event was deleted (called from API endpoints)
   */
  public broadcastEventDelete(eventId: string, _deletedBy: string) {
    // Remove lock if exists
    this.eventLocks.delete(eventId);

    this.broadcast({
      type: 'event_deleted',
      eventId,
    });
  }

  /**
   * Broadcast that a new event was created (called from API endpoints)
   */
  public broadcastEventCreate(eventId: string, _createdBy: string) {
    this.broadcast({
      type: 'event_created',
      eventId,
    });
  }

  /**
   * Get number of connected moderators
   */
  public getConnectedCount(): number {
    return this.clients.size;
  }

  /**
   * Check if an event is currently being viewed by a moderator
   */
  public isEventLocked(eventId: string): boolean {
    return this.eventLocks.has(eventId);
  }

  /**
   * Get the userId of who's viewing an event
   */
  public getEventLock(eventId: string): string | undefined {
    return this.eventLocks.get(eventId);
  }
}
