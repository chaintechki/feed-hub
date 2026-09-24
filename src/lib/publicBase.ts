/**
 * Public addresses handed to customers. Always the own domain –
 * the server's nginx forwards /api/* to the feed functions.
 */
const env = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/+$/, "");

export const PUBLIC_ORIGIN = env || "https://feed.feedarea.net";
export const FEED_BASE = `${PUBLIC_ORIGIN}/api`;
export const WIDGET_SCRIPT = `${PUBLIC_ORIGIN}/widget.js`;
