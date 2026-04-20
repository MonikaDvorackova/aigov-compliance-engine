/**
 * GovAI console — dark ink-navy atmosphere; steel accent; muted semantic states.
 */
export const colors = {
  bg: {
    base: "#0B1220",
    sidebar: "#0E1625",
    card: "#111A2B",
    card2: "#0F1726",
    inner: "#131D30",
  },
  text: {
    primary: "#F3F2EE",
    secondary: "#B6BDC7",
    muted: "#7E8794",
  },
  /** Muted steel — primary accent only (no chromatic hue) */
  accent: {
    steel: "#5F6B7A",
    steelHover: "#8C95A1",
    steelMuted: "#4A525D",
  },
  state: {
    success: "#5E7A67",
    warning: "#8A6A43",
    danger: "#8A5A5A",
  },
  border: {
    ink: "rgba(120,144,180,0.16)",
    inkFaint: "rgba(120,144,180,0.10)",
  },
} as const;

export type GovaiStatValueTone = "neutral" | "success" | "warning" | "danger";
