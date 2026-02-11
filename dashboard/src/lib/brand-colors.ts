/**
 * mneme brand color palette.
 *
 * Primary colors come from graph node typeColors.
 * Extended colors are derived to keep a consistent muted tone.
 * All UI badges, indicators, and accent colors should use this palette.
 *
 * @see dashboard/src/pages/graph/types.ts (typeColors)
 */

// --- Primary brand colors (graph node types) ---
export const brand = {
  session: "#40513B",
  decision: "#628141",
  pattern: "#2D8B7A",
  rule: "#E67E22",
  unknown: "#6b7280",
} as const;

// --- Extended palette (muted, consistent tone) ---
export const brandExtended = {
  purple: "#7B6B8D",
  error: "#C0392B",
  dark: "#44403c",
} as const;

// --- Semantic color tokens ---
// Each token defines light/dark variants for border, bg, text, and badge.

interface ColorToken {
  light: { border: string; bg: string; text: string; badge: string };
  dark: { border: string; bg: string; text: string; badge: string };
}

function makeToken(hex: string, darkText: string): ColorToken {
  return {
    light: {
      border: hex,
      bg: `${hex}14`, // ~8% opacity
      text: hex,
      badge: `${hex}26`, // ~15% opacity
    },
    dark: {
      border: `${hex}66`, // ~40% opacity
      bg: `${hex}1A`, // ~10% opacity
      text: darkText,
      badge: `${hex}33`, // ~20% opacity
    },
  };
}

/** Agent / subagent badge — teal (pattern) */
export const agentToken = makeToken(brand.pattern, "#5BB8A6");

/** Plan mode indicator — purple (extended) */
export const planToken = makeToken(brandExtended.purple, "#A596B6");

/** Thinking section — olive (decision) */
export const thinkingToken = makeToken(brand.decision, "#8FB368");

/** Tool details section — teal (pattern) */
export const toolDetailToken = makeToken(brand.pattern, "#5BB8A6");

/** Tool results section — session green */
export const toolResultToken = makeToken(brand.session, "#7A9B6B");

/** Progress events section — purple (extended) */
export const progressToken = makeToken(brandExtended.purple, "#A596B6");

/** Compact summary / auto-compact — rule orange */
export const compactToken = makeToken(brand.rule, "#E6994D");

/** Error / failure — muted red */
export const errorToken = makeToken(brandExtended.error, "#E07B6F");

/** Sidebar active dot — rule orange */
export const sidebarActiveToken = brand.rule;
