import { useEffect, useRef, useState, useCallback } from "react";

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface UseChatSocketOptions {
  roomName?: string;
  isOpen?: boolean;
}

export interface UseChatSocketReturn {
  messages: ChatMessage[];
  presenceCount: number;
  assignedName: string;
  displayName: string;
  avatar: string;
  isConnected: boolean;
  isConnecting: boolean;
  hasOnboarded: boolean;
  hasActivePass: boolean;
  error: string | null;
  typingUsers: string[];
  sendMessage: (text: string) => boolean;
  verifyAndActivatePass: (token: string, nameOverride?: string) => Promise<boolean>;
  setUsername: (newName: string) => boolean;
  sendTypingSignal: (isTyping: boolean) => void;
  clearError: () => void;
}

const DISPLAY_NAME_KEY = "portfolio_chat_display_name_v1";
const SESSION_STORAGE_KEY = "portfolio_chat_session_token_v1";
const CHAT_PASS_STORAGE_KEY = "portfolio_chat_pass_v1";

export function getStoredChatPass(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CHAT_PASS_STORAGE_KEY);
    if (!raw) return null;
    const [expStr] = raw.split(".");
    const exp = Number(expStr);
    if (!exp || Date.now() > exp) {
      sessionStorage.removeItem(CHAT_PASS_STORAGE_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function storeChatPass(pass: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAT_PASS_STORAGE_KEY, pass);
  } catch {
    // SessionStorage write ignored
  }
}

function clearStoredChatPass(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CHAT_PASS_STORAGE_KEY);
  } catch {
    // SessionStorage delete ignored
  }
}

/** Polling interval in milliseconds. */
const POLL_INTERVAL_MS = 5000;

const CHESS_AVATARS = ["knight", "rook", "bishop", "pawn", "king", "queen"];
const RESERVED_NAMES = [
  "admin",
  "system",
  "mod",
  "moderator",
  "owner",
  "bot",
  "anthropic",
  "claude",
  "openai",
  "gpt",
  "gemini",
  "mistral",
];

/**
 * Validates a user-submitted display name.
 */
export function validateUsername(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: "Username cannot be empty or whitespace only." };
  }
  if (trimmed.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters." };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: "Username must be 20 characters or fewer." };
  }
  const lower = trimmed.toLowerCase();
  if (RESERVED_NAMES.some((res) => lower.includes(res))) {
    return { valid: false, error: `The username "${trimmed}" is reserved. Please choose another.` };
  }
  return { valid: true };
}

function getOrCreateSessionToken(): string {
  if (typeof window === "undefined") return "server_placeholder";
  try {
    let token = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!token) {
      token = crypto.randomUUID
        ? crypto.randomUUID()
        : `anon_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    }
    return token;
  } catch {
    return `anon_${Math.random().toString(36).substring(2, 11)}`;
  }
}

function getInitialDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY) || "";
  } catch {
    return "";
  }
}

function getAvatarForSession(sessionToken: string): string {
  let hash = 0;
  for (let i = 0; i < sessionToken.length; i++) {
    hash = (hash << 5) - hash + sessionToken.charCodeAt(i);
    hash |= 0;
  }
  return CHESS_AVATARS[Math.abs(hash) % CHESS_AVATARS.length];
}

/**
 * React Hook managing chat via HTTP polling against `/api/chat/messages`
 * and `/api/chat/send`. Polls strictly when `isOpen` is true and the tab
 * is visible (`!document.hidden`).
 */
export function useChatSocket(options: UseChatSocketOptions = {}): UseChatSocketReturn {
  const { isOpen = false } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayName, setDisplayNameState] = useState<string>(getInitialDisplayName);
  const [avatar, setAvatar] = useState<string>("knight");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [hasActivePass, setHasActivePass] = useState<boolean>(() => Boolean(getStoredChatPass()));
  const [error, setError] = useState<string | null>(null);

  const displayNameRef = useRef<string>(displayName);

  // Synchronize ref with state
  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  // Initial avatar computation
  useEffect(() => {
    const token = getOrCreateSessionToken();
    setAvatar(getAvatarForSession(token));
  }, []);

  const hasOnboarded = Boolean(displayName.trim() && displayName.trim().length >= 3);

  function areMessagesIdentical(prev: ChatMessage[], next: ChatMessage[]): boolean {
    if (prev === next) return true;
    if (prev.length !== next.length) return false;
    if (prev.length === 0) return true;
    if (prev[prev.length - 1]?.id !== next[next.length - 1]?.id || prev[0]?.id !== next[0]?.id) {
      return false;
    }
    for (let i = 0; i < prev.length; i++) {
      if (prev[i].id !== next[i].id || prev[i].text !== next[i].text) {
        return false;
      }
    }
    return true;
  }

  // Fetch messages from the HTTP API
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/messages");
      if (!res.ok) {
        setIsConnected(false);
        return;
      }
      const data = await res.json();
      if (data && Array.isArray(data.messages)) {
        setMessages((prev) => (areMessagesIdentical(prev, data.messages) ? prev : data.messages));
        setIsConnected(true);
      }
    } catch (err) {
      console.error("[Chat Fetch Error]:", err);
      setIsConnected(false);
    }
  }, []);

  // Poll for messages ONLY when chat modal is open and browser tab is visible
  useEffect(() => {
    if (!isOpen) {
      setIsConnected(false);
      return;
    }

    // Initial fetch on modal open
    fetchMessages();

    const handleVisibilityChange = () => {
      if (!document.hidden && isOpen) {
        fetchMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchMessages();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOpen, fetchMessages]);

  // Action: Set Initial Username (Onboarding — single-use only)
  const setUsername = useCallback((newName: string): boolean => {
    // If username is already set, enforce one-time naming rule
    if (displayNameRef.current && displayNameRef.current.trim().length >= 3) {
      return true;
    }

    const validation = validateUsername(newName);
    if (!validation.valid) {
      setError(validation.error || "Invalid username.");
      return false;
    }

    const trimmed = newName.trim();
    setDisplayNameState(trimmed);
    displayNameRef.current = trimmed;

    try {
      localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
    } catch {
      // Ignore storage error
    }

    setError(null);
    return true;
  }, []);

  // Action: Verify Turnstile and activate 15-minute pass
  const verifyAndActivatePass = useCallback(
    async (token: string, nameOverride?: string): Promise<boolean> => {
      if (!token) return false;
      const targetName = nameOverride?.trim() || displayName || "Guest";
      try {
        const res = await fetch("/api/chat/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: targetName,
            "cf-turnstile-response": token,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(data.error || "Security verification failed. Please try again.");
          return false;
        }

        if (data.chatPass) {
          storeChatPass(data.chatPass);
          setHasActivePass(true);
        }
        setError(null);
        return true;
      } catch (err) {
        console.error("[Pass Verification Error]:", err);
        setError("Network error during verification. Please try again.");
        return false;
      }
    },
    [displayName]
  );

  // Global listener for expired pass triggered by chess moves or other actions
  useEffect(() => {
    const handleRequirePass = () => {
      clearStoredChatPass();
      setHasActivePass(false);
    };
    window.addEventListener("portfolio-chat-require-pass", handleRequirePass);
    return () => window.removeEventListener("portfolio-chat-require-pass", handleRequirePass);
  }, []);

  // Periodic pass freshness check (runs every 5 seconds)
  useEffect(() => {
    const checkPass = () => {
      const active = !!getStoredChatPass();
      setHasActivePass(active);
    };
    checkPass();
    const timer = setInterval(checkPass, 5000);
    return () => clearInterval(timer);
  }, []);

  // Action: Send Message via HTTP POST
  const sendMessage = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const currentName = displayName;

      // Optimistic local append
      const optimisticMsg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: currentName,
        avatar,
        text: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev.slice(-49), optimisticMsg]);

      const activePass = getStoredChatPass();

      // POST to server
      fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activePass ? { "x-chat-pass": activePass } : {}),
        },
        body: JSON.stringify({
          sender: currentName,
          avatar,
          text: trimmed,
          chatPass: activePass || undefined,
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (data.requireTurnstile) {
              clearStoredChatPass();
              setHasActivePass(false);
            }
            setError(data.error || "Failed to send message.");
            fetchMessages();
            return;
          }
          if (data && data.chatPass) {
            storeChatPass(data.chatPass);
            setHasActivePass(true);
          }
          if (data && Array.isArray(data.history)) {
            setMessages((prev) => (areMessagesIdentical(prev, data.history) ? prev : data.history));
          }
          fetchMessages();
        })
        .catch((err) => {
          console.error("[Chat Send Error]:", err);
          setError("Network error while sending message.");
        });

      return true;
    },
    [displayName, avatar, fetchMessages]
  );

  // No-op: typing signals are not supported with HTTP polling
  const sendTypingSignal = useCallback(() => {}, []);

  // Action: Clear Error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    presenceCount: 0,
    assignedName: displayName,
    displayName,
    avatar,
    isConnected,
    isConnecting: false,
    hasOnboarded,
    hasActivePass,
    error,
    typingUsers: [],
    sendMessage,
    verifyAndActivatePass,
    setUsername,
    sendTypingSignal,
    clearError,
  };
}
