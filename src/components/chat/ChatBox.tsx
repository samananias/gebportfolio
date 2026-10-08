import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChatSocket, validateUsername } from "./useChatSocket";
import { ChessWidget } from "../chess/ChessWidget";
import { GameDetailsModal, type PublicGameState } from "../chess/GameDetailsModal";
import { ToastContainer, MistakeIcon } from "../feedback/Toast";
import { DoodleIcon } from "../ui/DoodleIcon";
import { TURNSTILE_SITE_KEY } from "../../lib/turnstileConstants";

interface ChatBoxProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHESS_SYMBOLS: Record<string, string> = {
  knight: "♞",
  rook: "♜",
  bishop: "♝",
  pawn: "♟",
  king: "♔",
  queen: "♛",
};

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Memoized Chat Input Form — clean and lightweight without embedded CAPTCHA
interface ChatInputFormProps {
  onSend: (text: string) => void;
  assignedName: string;
}

const ChatInputForm: React.FC<ChatInputFormProps> = React.memo(({ onSend, assignedName }) => {
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInputText("");
  };

  return (
    <footer className="border-border-custom/60 mt-3 shrink-0 border-t pt-3">
      <div className="text-text-muted mb-1.5 flex items-center justify-between font-mono text-[11px]">
        <div>
          chatting as <span className="text-text font-bold">{assignedName}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={280}
            placeholder="say something..."
            className="bg-surface border-border-custom text-text placeholder:text-text-muted focus:ring-primary w-full rounded-xl border py-2 pr-12 pl-3 font-sans text-xs outline-none focus:ring-2"
          />
          <span className="text-text-muted absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[9px]">
            {inputText.length}/280
          </span>
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="bg-primary border-primary shrink-0 cursor-pointer rounded-xl border px-3 py-2 font-mono text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
        >
          send ↵
        </button>
      </form>
    </footer>
  );
});

// Reusable Gate Turnstile Widget for modal screens
interface TurnstileGateWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  action?: string;
}

const TurnstileGateWidget: React.FC<TurnstileGateWidgetProps> = React.memo(
  ({ onVerify, onExpire, action = "chat" }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);

    const onVerifyRef = useRef(onVerify);
    onVerifyRef.current = onVerify;

    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
      let isMounted = true;
      let pollCount = 0;
      const maxPolls = 30;

      const renderWidget = () => {
        if (!isMounted || widgetIdRef.current) return;
        if (typeof window !== "undefined" && window.turnstile && containerRef.current) {
          try {
            const id = window.turnstile.render(containerRef.current, {
              sitekey: TURNSTILE_SITE_KEY,
              action,
              theme: "auto",
              size: "flexible",
              callback: (token: string) => {
                if (isMounted) onVerifyRef.current(token);
              },
              "expired-callback": () => {
                if (isMounted) onExpireRef.current?.();
              },
              "error-callback": () => {
                if (isMounted) onExpireRef.current?.();
              },
            });
            widgetIdRef.current = id;
            return;
          } catch (err) {
            console.warn("[Turnstile Gate Render Error]:", err);
          }
        }

        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(renderWidget, 200);
        } else if (typeof window !== "undefined" && !window.turnstile) {
          // Fallback if Turnstile script is blocked or in automated test environments
          onVerifyRef.current("dummy-test-token");
        }
      };

      renderWidget();

      return () => {
        isMounted = false;
        if (widgetIdRef.current && window.turnstile?.remove) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // Teardown error ignored
          }
          widgetIdRef.current = null;
        }
      };
    }, [action]);

    return (
      <div className="flex min-h-[65px] items-center justify-center overflow-hidden rounded-lg">
        <div ref={containerRef} />
      </div>
    );
  }
);

// Memoized Message List — avoids re-rendering live message items when irrelevant state changes
interface MessageListProps {
  messages: ReturnType<typeof useChatSocket>["messages"];
  assignedName: string;
  displayName: string;
}

const MessageList: React.FC<MessageListProps> = React.memo(
  ({ messages, assignedName, displayName }) => {
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    if (messages.length === 0) {
      return (
        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <span className="font-display text-primary text-3xl">♞</span>
            <h4 className="font-display text-text mt-2 text-sm font-bold">
              Welcome to Live Portfolio Chat!
            </h4>
            <p className="text-text-muted mt-1 font-sans text-xs leading-relaxed">
              No messages sent yet. Be the first to start the conversation!
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((msg) => {
          const isMe = msg.sender === (assignedName || displayName);
          const isSystemMsg = msg.isSystem || msg.sender === "System";
          const avatarSymbol = CHESS_SYMBOLS[msg.avatar] || "♞";

          if (isSystemMsg) {
            return (
              <div key={msg.id} className="my-2 text-center">
                <span className="bg-surface-subtle border-border-custom/50 text-text-muted inline-block rounded-full border px-3 py-0.5 font-mono text-[10px] italic">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar Circle */}
              <div
                title={msg.sender}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold shadow-xs select-none ${
                  isMe
                    ? "bg-primary border-primary text-white"
                    : "bg-surface border-border-custom text-primary"
                }`}
              >
                {avatarSymbol}
              </div>

              {/* Message Content & Metadata */}
              <div className={`flex max-w-[82%] flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className="text-text-muted mb-1 flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="font-bold">{msg.sender}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(msg.timestamp)}</span>
                </div>

                <div
                  className={`rounded-2xl border px-3.5 py-2 font-sans text-xs leading-relaxed break-words shadow-sm ${
                    isMe
                      ? "bg-primary border-primary rounded-tr-xs text-white"
                      : "bg-surface-subtle/90 border-border-custom/60 text-text rounded-tl-xs"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    );
  }
);

export const ChatBox: React.FC<ChatBoxProps> = ({ isOpen, onClose }) => {
  const {
    messages,
    isConnected,
    error,
    displayName,
    assignedName,
    hasOnboarded,
    hasActivePass,
    sendMessage,
    verifyAndActivatePass,
    setUsername,
    clearError,
  } = useChatSocket({ isOpen });

  const [onboardingInput, setOnboardingInput] = useState("");
  const [onboardingToken, setOnboardingToken] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "chess">("chat");

  // Shared Chess Widget Controls State
  const [is3D, setIs3D] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);

  const onboardingInputRef = useRef<HTMLInputElement | null>(null);

  // Stable callback for updating game state from ChessWidget
  const handleGameStateChange = useCallback((state: PublicGameState | null) => {
    setGameState(state);
  }, []);

  const handleOnboardingVerify = useCallback((token: string) => {
    setOnboardingToken(token);
  }, []);

  const handleOnboardingExpire = useCallback(() => {
    setOnboardingToken("");
  }, []);

  const handleGateVerify = useCallback(
    async (token: string) => {
      if (!token || isVerifying) return;
      setIsVerifying(true);
      setValidationError(null);
      await verifyAndActivatePass(token, displayName);
      setIsVerifying(false);
    },
    [isVerifying, verifyAndActivatePass, displayName]
  );

  // Focus input when onboarding opens
  useEffect(() => {
    if (isOpen && !hasOnboarded) {
      setTimeout(() => onboardingInputRef.current?.focus(), 100);
    }
  }, [isOpen, hasOnboarded]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const handleOnboardingSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const trimmed = onboardingInput.trim();
    const validation = validateUsername(trimmed);
    if (!validation.valid) {
      setValidationError(validation.error || "Username must be between 3 and 20 characters.");
      return;
    }

    const token =
      onboardingToken ||
      (typeof window !== "undefined" && window.turnstile?.getResponse
        ? window.turnstile.getResponse()
        : "") ||
      "";

    const isTestOrDev =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    const effectiveToken = token || (isTestOrDev ? "dummy-test-token" : "");

    if (!effectiveToken && typeof window !== "undefined" && window.turnstile) {
      setValidationError("Please complete the security verification below.");
      return;
    }

    setIsVerifying(true);
    setValidationError(null);

    const verified = await verifyAndActivatePass(effectiveToken || "dummy-test-token", trimmed);
    if (!verified) {
      setIsVerifying(false);
      setOnboardingToken("");
      return;
    }

    const success = setUsername(trimmed);
    if (!success) {
      setValidationError("Failed to set username.");
      setIsVerifying(false);
      return;
    }

    setIsVerifying(false);
    setValidationError(null);
  };

  if (!isOpen) return null;

  const activeError = validationError || error;

  return (
    <div
      aria-label="Real-time live chat room"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6 md:p-8"
    >
      {/* Global Toast Container */}
      <ToastContainer />

      {/* Background click handler */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* 1. Mandatory Onboarding Screen (First-time visitor) */}
      {!hasOnboarded ? (
        <div className="border-border-custom bg-surface relative z-10 w-full max-w-md rounded-2xl border-2 p-6 text-left shadow-[4px_4px_0_var(--color-border)] sm:p-7">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat modal"
            className="border-border-custom text-text-muted hover:text-text hover:bg-surface-subtle absolute top-4 right-4 flex size-8 cursor-pointer items-center justify-center rounded-lg border transition-colors"
          >
            <DoodleIcon name="cross" className="size-3.5" />
          </button>

          <div className="border-border-custom bg-surface-subtle text-primary mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border shadow-[2px_2px_0_var(--color-border)]">
            <DoodleIcon name="user" className="text-primary size-6" />
          </div>

          <h3 className="font-display text-text mb-2 text-center text-2xl font-bold tracking-tight">
            Enter Handle to Play Chess & Chat
          </h3>
          <p className="text-text-muted mb-5 text-center font-sans text-xs leading-relaxed">
            Choose a display name for this session to enter the live chat room and join the communal
            chess team!
          </p>

          {activeError && (
            <div className="border-border-custom mb-4 flex items-center justify-between rounded-xl border bg-rose-500/10 px-3.5 py-2.5 font-mono text-xs text-rose-700 dark:text-rose-300">
              <span className="flex items-center gap-2 truncate">
                <DoodleIcon name="caution" className="size-3.5 shrink-0" />
                {activeError}
              </span>
              <button
                type="button"
                onClick={() => {
                  setValidationError(null);
                  clearError();
                }}
                className="ml-2 shrink-0 cursor-pointer font-semibold text-rose-600 hover:underline dark:text-rose-400"
              >
                Dismiss
              </button>
            </div>
          )}

          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            <div className="relative text-left">
              <label
                htmlFor="onboarding-username"
                className="text-text mb-1.5 block font-mono text-xs font-semibold"
              >
                Display Name <span className="text-text-muted font-normal">(3–20 characters)</span>
              </label>
              <div className="relative">
                <input
                  id="onboarding-username"
                  ref={onboardingInputRef}
                  type="text"
                  value={onboardingInput}
                  onChange={(e) => {
                    setOnboardingInput(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  maxLength={20}
                  placeholder="e.g. TacticalKnight"
                  className="border-border-custom bg-surface-subtle text-text placeholder:text-text-muted focus:border-primary focus:bg-surface w-full rounded-xl border px-3.5 py-2.5 font-sans text-sm transition-colors outline-none"
                />
                <span className="text-text-muted absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px]">
                  {onboardingInput.trim().length}/20
                </span>
              </div>
            </div>

            <div className="border-border-custom/80 bg-surface-subtle/40 rounded-xl border p-3">
              <div className="text-text-muted mb-2 flex items-center justify-center gap-1.5 font-mono text-[11px]">
                <DoodleIcon name="lock" className="text-primary size-3" />
                <span>Security Verification</span>
              </div>
              <div className="flex min-h-[65px] items-center justify-center overflow-hidden">
                <TurnstileGateWidget
                  onVerify={handleOnboardingVerify}
                  onExpire={handleOnboardingExpire}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={onboardingInput.trim().length < 3 || isVerifying}
              className="bg-primary border-primary hover:bg-primary-hover w-full cursor-pointer rounded-xl border px-4 py-2.5 font-mono text-sm font-semibold text-white shadow-[2px_2px_0_var(--color-border)] transition-all active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
            >
              {isVerifying ? "Verifying & Joining..." : "Play & Join Chat ♞"}
            </button>
          </form>
        </div>
      ) : !hasActivePass ? (
        /* 2. Human Verification Gate Screen (Returning user or pass expired) */
        <div className="border-border-custom bg-surface relative z-10 w-full max-w-md rounded-2xl border-2 p-6 text-center shadow-[4px_4px_0_var(--color-border)] sm:p-7">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat modal"
            className="border-border-custom text-text-muted hover:text-text hover:bg-surface-subtle absolute top-4 right-4 flex size-8 cursor-pointer items-center justify-center rounded-lg border transition-colors"
          >
            <DoodleIcon name="cross" className="size-3.5" />
          </button>

          <div className="border-border-custom bg-surface-subtle text-primary mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border shadow-[2px_2px_0_var(--color-border)]">
            <DoodleIcon name="shield" className="text-primary size-6" />
          </div>

          <h3 className="font-display text-text mb-2 text-center text-2xl font-bold tracking-tight">
            Verify to Enter Arena
          </h3>
          <p className="text-text-muted mb-4 text-center font-sans text-xs leading-relaxed">
            Security verification is required to participate in live chat and submit shared chess
            moves.
          </p>

          {/* Player Callsign Badge */}
          <div className="border-border-custom bg-surface-subtle/70 mb-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left">
            <div className="border-border-custom bg-surface text-primary flex size-8 shrink-0 items-center justify-center rounded-lg border">
              <DoodleIcon name="user" className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-text-muted font-mono text-[10px] tracking-wider uppercase">
                Player Callsign
              </div>
              <div className="text-text truncate font-mono text-xs font-bold">{displayName}</div>
            </div>
          </div>

          {activeError && (
            <div className="border-border-custom mb-4 flex items-center justify-between rounded-xl border bg-rose-500/10 px-3.5 py-2.5 font-mono text-xs text-rose-700 dark:text-rose-300">
              <span className="flex items-center gap-2 truncate">
                <DoodleIcon name="caution" className="size-3.5 shrink-0" />
                {activeError}
              </span>
              <button
                type="button"
                onClick={() => {
                  setValidationError(null);
                  clearError();
                }}
                className="ml-2 shrink-0 cursor-pointer font-semibold text-rose-600 hover:underline dark:text-rose-400"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Framed Turnstile Challenge Plate */}
          <div className="border-border-custom/80 bg-surface-subtle/40 mb-4 rounded-xl border p-3">
            <div className="text-text-muted mb-2.5 flex items-center justify-center gap-1.5 font-mono text-[11px]">
              <DoodleIcon name="lock" className="text-primary size-3" />
              <span>Cloudflare Turnstile Gate</span>
            </div>
            <div className="flex min-h-[65px] items-center justify-center overflow-hidden">
              <TurnstileGateWidget
                onVerify={handleGateVerify}
                onExpire={() => setIsVerifying(false)}
              />
            </div>
          </div>

          {isVerifying ? (
            <div className="text-primary flex items-center justify-center gap-2 py-1 font-mono text-xs font-semibold">
              <span className="bg-primary size-1.5 animate-pulse rounded-full" />
              <span>Activating security pass...</span>
            </div>
          ) : (
            <div className="text-text-muted flex items-center justify-center gap-1.5 font-mono text-[11px]">
              <DoodleIcon name="sparkle" className="text-primary size-3" />
              <span>Grants live arena access</span>
            </div>
          )}
        </div>
      ) : (
        /* 3. Onboarded Dual Panel Layout (Active security pass) */
        <div className="pointer-events-none relative z-10 flex h-[88vh] w-full max-w-7xl flex-col items-stretch justify-between gap-4 md:flex-row md:gap-6">
          {/* Mobile Tab Switcher (< md screens) */}
          <div className="border-border-custom bg-bg/95 pointer-events-auto flex items-center justify-between rounded-xl border p-1.5 backdrop-blur-xl md:hidden">
            <div className="flex flex-1 gap-1">
              <button
                type="button"
                onClick={() => setMobileTab("chat")}
                className={`flex-1 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-all ${
                  mobileTab === "chat"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Chat ({messages.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("chess")}
                className={`flex-1 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-all ${
                  mobileTab === "chess"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                ♞ Shared Chess
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close mobile chat modal"
              className="text-text-muted hover:text-text ml-2 flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-base leading-none transition-colors"
            >
              <DoodleIcon name="cross" className="size-4" />
            </button>
          </div>

          {/* LEFT FLOATING PANEL: Chatbox */}
          <div
            className={`border-border-custom bg-bg/95 pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-2xl border p-4 shadow-2xl backdrop-blur-xl md:w-[380px] lg:w-[420px] ${
              mobileTab === "chat" ? "flex" : "hidden md:flex"
            }`}
          >
            {/* Left Header */}
            <header className="border-border-custom/60 mb-3 flex shrink-0 items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-text-muted flex items-center gap-1 font-mono text-xs">
                  <DoodleIcon name="message" className="size-3.5" /> {messages.length} messages
                </span>
                <span
                  title={isConnected ? "Live" : "Connecting..."}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    isConnected
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isConnected ? "animate-pulse bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {isConnected ? "Live" : "Connecting"}
                </span>
              </div>

              {/* Chatbox Header Controls: 3D View Toggle, Details SVG Button & Close */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIs3D(!is3D)}
                  title="Toggle between 3D Perspective and 2D Top-Down View"
                  className="border-border-custom hover:bg-surface-subtle text-text flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold transition-colors"
                >
                  <DoodleIcon name="camera" className="size-3.5" />
                  {is3D ? "3D View" : "2D View"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(true)}
                  title="Game Details & History"
                  aria-label="Open Game Details"
                  className="hover:bg-surface-subtle text-text flex cursor-pointer items-center justify-center rounded-lg p-1 transition-colors"
                >
                  <MistakeIcon className="size-5 select-none" />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close chat modal"
                  className="text-text-muted hover:text-text hidden cursor-pointer rounded-md p-1 text-base leading-none transition-colors md:block"
                >
                  <DoodleIcon name="cross" className="size-4" />
                </button>
              </div>
            </header>

            {/* Error Banner */}
            {activeError && (
              <div className="border-border-custom mb-2 flex items-center justify-between rounded border bg-rose-500/10 px-3 py-1.5 font-mono text-xs text-rose-700 dark:text-rose-300">
                <span className="truncate">{activeError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setValidationError(null);
                    clearError();
                  }}
                  className="ml-2 text-rose-600 hover:underline dark:text-rose-400"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Live Message Feed */}
            <MessageList
              messages={messages}
              assignedName={assignedName}
              displayName={displayName}
            />

            {/* Footer Input Form */}
            <ChatInputForm onSend={sendMessage} assignedName={assignedName || displayName} />
          </div>

          {/* CENTER SPACER: Allows Portfolio Hero / Content to show cleanly between the two panels */}
          <div className="pointer-events-none hidden flex-1 md:block" />

          {/* RIGHT FLOATING PANEL: Headerless & Frameless Pure Shared Chess Board */}
          <div
            className={`pointer-events-auto flex h-full w-full flex-col items-center justify-center overflow-visible md:w-[380px] lg:w-[440px] ${
              mobileTab === "chess" ? "flex" : "hidden md:flex"
            }`}
          >
            <ChessWidget
              displayName={assignedName || displayName}
              is3D={is3D}
              onGameStateChange={handleGameStateChange}
            />
          </div>
        </div>
      )}

      {/* Game Details Popover Modal */}
      <GameDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        gameState={gameState}
        displayName={assignedName || displayName}
      />
    </div>
  );
};
