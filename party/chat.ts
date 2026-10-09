/**
 * PartyKit Real-Time Anonymous Chat Server
 *
 * Manages WebSocket connections, in-memory configurable ring buffer,
 * rate limiting, HTML escaping, and system event broadcasting.
 */

import { verifyChatPassDetailed } from "../src/lib/turnstile";

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface ClientConnectionState {
  sessionToken: string;
  displayName: string;
  assignedName: string;
  avatar: string;
  expiresAt: number;
  messageTimestamps: number[];
  lastMessageText?: string;
}

// Server Configuration Defaults
export const MAX_CHAT_HISTORY = 50;
export const ENABLE_SYSTEM_MESSAGES = true;
export const MAX_MESSAGE_LENGTH = 280;
export const RATE_LIMIT_WINDOW_MS = 5000;
export const RATE_LIMIT_MAX_MESSAGES = 3;

const CHESS_AVATARS = ["knight", "rook", "bishop", "pawn", "king", "queen"] as const;
const RESERVED_NAMES = ["admin", "system", "mod", "moderator", "gen", "sam"];

/**
 * Escapes HTML special characters to prevent XSS injection attacks.
 */
export function sanitizeText(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates a deterministic chess avatar derived from a session token.
 */
export function getAvatarForSession(sessionToken: string): string {
  let hash = 0;
  for (let i = 0; i < sessionToken.length; i++) {
    hash = (hash << 5) - hash + sessionToken.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CHESS_AVATARS.length;
  return CHESS_AVATARS[index];
}

/**
 * Checks if a display name contains reserved system or admin terms.
 */
export function isReservedName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return RESERVED_NAMES.some((reserved) => lower.includes(reserved));
}

export interface PartyConnection {
  id: string;
  send: (data: string) => void;
  close?: (code?: number, reason?: string) => void;
}

export interface PartyConnectionContext {
  request: {
    url: string;
    headers?: Headers | { get?: (k: string) => string | null };
  };
}

export interface PartyRoom {
  id: string;
  env?: Record<string, string>;
  broadcast: (data: string, except?: string[]) => void;
}

/**
 * PartyKit Server implementation for real-time portfolio chatroom.
 */
export default class PortfolioChatServer {
  private history: ChatMessage[] = [];
  private connectionStates: Map<string, ClientConnectionState> = new Map();

  constructor(public readonly room: PartyRoom) {}

  /**
   * Called when a new WebSocket client connects.
   * Authenticates session pass before admitting client to the room.
   */
  async onConnect(conn: PartyConnection, ctx: PartyConnectionContext) {
    const url = new URL(ctx.request.url);
    const pass = url.searchParams.get("pass") || url.searchParams.get("token") || "";
    const rawName = url.searchParams.get("name") || "TacticalKnight";
    const sanitizedRawName = sanitizeText(rawName).slice(0, 20) || "GuestPlayer";

    const secret =
      this.room.env?.TURNSTILE_SECRET ||
      (typeof process !== "undefined" ? process.env?.TURNSTILE_SECRET : undefined);

    const clientIp =
      (typeof ctx.request.headers?.get === "function"
        ? ctx.request.headers.get("cf-connecting-ip") ||
          ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        : "") || "unknown";

    // Enforce cryptographic session authentication during WebSocket handshake
    const passInfo = await verifyChatPassDetailed(pass, clientIp, secret);

    if (!passInfo.valid || !passInfo.name || passInfo.name !== sanitizedRawName) {
      conn.send(
        JSON.stringify({
          type: "error",
          code: 401,
          message: "Authentication required. Please complete security verification in Live Chat.",
        })
      );
      if (typeof conn.close === "function") {
        conn.close(4401, "Unauthorized");
      }
      return;
    }

    const exp = Number(pass.split(".")[0]) || Date.now() + 15 * 60 * 1000;
    const sessionToken = pass;
    const authorizedName = passInfo.name;
    const avatar = getAvatarForSession(sessionToken);

    // Compute display name & conditional discriminator if name collision exists
    const assignedName = this.computeAssignedName(conn.id, sessionToken, authorizedName);

    const clientState: ClientConnectionState = {
      sessionToken,
      displayName: authorizedName,
      assignedName,
      avatar,
      expiresAt: exp,
      messageTimestamps: [],
    };

    this.connectionStates.set(conn.id, clientState);

    // 1. Send initial state sync to the connecting client
    conn.send(
      JSON.stringify({
        type: "sync",
        history: this.history,
        presenceCount: this.connectionStates.size,
        assignedName,
        avatar,
      })
    );

    // 2. Broadcast active user presence update to all clients
    this.broadcastPresence();

    // 3. Send private welcome message
    conn.send(
      JSON.stringify({
        type: "message",
        message: {
          id: `sys_welcome_${Date.now()}`,
          sender: "System",
          avatar: "king",
          text: "Welcome to the portfolio live chat!",
          timestamp: Date.now(),
          isSystem: true,
        },
      })
    );

    // 4. Broadcast public join system event if enabled
    if (ENABLE_SYSTEM_MESSAGES) {
      const joinMessage: ChatMessage = {
        id: `sys_join_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender: "System",
        avatar,
        text: `♞ ${assignedName} joined the chat`,
        timestamp: Date.now(),
        isSystem: true,
      };
      this.pushToHistory(joinMessage);
      this.room.broadcast(JSON.stringify({ type: "message", message: joinMessage }), [conn.id]);
    }
  }

  /**
   * Called when a connected client sends a WebSocket frame.
   */
  async onMessage(messageStr: string, sender: PartyConnection) {
    try {
      const data = JSON.parse(messageStr);
      const state = this.connectionStates.get(sender.id);
      if (!state) return;

      // Check session expiration
      if (Date.now() > state.expiresAt) {
        sender.send(
          JSON.stringify({
            type: "error",
            code: 403,
            message: "Session expired. Please re-verify in Live Chat to continue.",
          })
        );
        if (typeof sender.close === "function") {
          sender.close(4403, "Session Expired");
        }
        return;
      }

      if (data.type === "chat") {
        const rawText = data.text;
        if (!rawText || typeof rawText !== "string") return;

        const sanitized = sanitizeText(rawText);
        if (!sanitized) return;

        // Rate Limiting Check (Max 3 msgs per 5 sec)
        const now = Date.now();
        state.messageTimestamps = state.messageTimestamps.filter(
          (ts) => now - ts < RATE_LIMIT_WINDOW_MS
        );

        if (state.messageTimestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
          sender.send(
            JSON.stringify({
              type: "error",
              code: 429,
              message:
                "Rate limit exceeded. Please wait a few seconds before sending another message.",
            })
          );
          return;
        }

        // Duplicate Message Check
        if (state.lastMessageText && state.lastMessageText === sanitized) {
          sender.send(
            JSON.stringify({
              type: "error",
              code: 400,
              message: "Duplicate message ignored.",
            })
          );
          return;
        }

        // Record message timestamp & text
        state.messageTimestamps.push(now);
        state.lastMessageText = sanitized;

        const chatMsg: ChatMessage = {
          id: `msg_${now}_${Math.random().toString(36).substring(2, 7)}`,
          sender: state.assignedName,
          avatar: state.avatar,
          text: sanitized,
          timestamp: now,
        };

        this.pushToHistory(chatMsg);
        this.room.broadcast(JSON.stringify({ type: "message", message: chatMsg }));
      } else if (data.type === "typing") {
        this.room.broadcast(
          JSON.stringify({
            type: "typing",
            sender: state.assignedName,
            isTyping: Boolean(data.isTyping),
          }),
          [sender.id]
        );
      } else if (data.type === "name_change") {
        const newRawName = sanitizeText(data.name || "").slice(0, 20);
        if (newRawName && newRawName !== state.displayName) {
          state.displayName = newRawName;
          state.assignedName = this.computeAssignedName(sender.id, state.sessionToken, newRawName);
          sender.send(
            JSON.stringify({
              type: "name_updated",
              assignedName: state.assignedName,
            })
          );
        }
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  }

  /**
   * Called when a client socket disconnects.
   */
  async onClose(conn: PartyConnection) {
    const state = this.connectionStates.get(conn.id);
    if (state) {
      this.connectionStates.delete(conn.id);
      this.broadcastPresence();

      if (ENABLE_SYSTEM_MESSAGES) {
        const leaveMessage: ChatMessage = {
          id: `sys_leave_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sender: "System",
          avatar: state.avatar,
          text: `♜ ${state.assignedName} left the chat`,
          timestamp: Date.now(),
          isSystem: true,
        };
        this.pushToHistory(leaveMessage);
        this.room.broadcast(JSON.stringify({ type: "message", message: leaveMessage }));
      }
    }
  }

  /**
   * Adds a message to the in-memory configurable ring buffer (capping at MAX_CHAT_HISTORY).
   */
  private pushToHistory(msg: ChatMessage) {
    this.history.push(msg);
    if (this.history.length > MAX_CHAT_HISTORY) {
      this.history.shift();
    }
  }

  /**
   * Broadcasts the current active presence count to all connected clients.
   */
  private broadcastPresence() {
    this.room.broadcast(
      JSON.stringify({
        type: "presence",
        presenceCount: this.connectionStates.size,
      })
    );
  }

  /**
   * Computes clean display name or appends conditional 4-digit discriminator on name collision.
   */
  private computeAssignedName(
    currentConnId: string,
    sessionToken: string,
    requestedName: string
  ): string {
    let name = requestedName;
    if (isReservedName(name)) {
      name = `${name} [Guest]`;
    }

    // Check if another active connection uses the exact same name
    let isCollision = false;
    for (const [id, state] of this.connectionStates.entries()) {
      if (id !== currentConnId && state.displayName.toLowerCase() === requestedName.toLowerCase()) {
        isCollision = true;
        break;
      }
    }

    if (isCollision) {
      const discriminator =
        Math.abs(sessionToken.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 10000;
      const formattedDiscrim = String(discriminator).padStart(4, "0");
      return `${name}#${formattedDiscrim}`;
    }

    return name;
  }
}
