/**
 * GovAI console — dark ink-navy atmosphere; steel accent; muted semantic states.
 */
export const colors = {
  bg: {
    base: "#0B1220",
    sidebar: "#101318",
    card: "#1A1D24",
    card2: "#14161D",
    inner: "#242930",
  },
  text: {
    primary: "#F6F5F2",
    secondary: "#B9C2CC",
    muted: "#8B95A3",
  },
  /** Muted steel — primary accent only (no chromatic hue) */
  accent: {
    steel: "#5F6B7A",
    steelHover: "#8C95A1",
    steelMuted: "#4A525D",
  },
  state: {
    success: "#86B092",
    warning: "#C49A62",
    danger: "#C09090",
  },
  border: {
    surface: "rgba(255,255,255,0.09)",
    surfaceStrong: "rgba(255,255,255,0.14)",
    inkFaint: "rgba(120,144,180,0.12)",
  },
} as const;

export type GovaiStatValueTone = "neutral" | "success" | "warning" | "danger";
