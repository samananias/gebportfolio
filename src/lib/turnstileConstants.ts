export const TURNSTILE_SITE_KEY = "0x4AAAAAAFRF21R_W1pBeMMF";

export interface TurnstileApi {
  render(
    container: string | HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      cData?: string;
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "compact" | "flexible" | "invisible";
      tabindex?: number;
    }
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
  getResponse(widgetId?: string): string | undefined;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
