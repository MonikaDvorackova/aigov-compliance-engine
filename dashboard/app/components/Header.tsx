import Link from "next/link";
import Logo from "./Logo";

/**
 * Minimal marketing header: brand mark + Sign in.
 * Keeps spacing tight so the hero layout below is unchanged in rhythm.
 */
export default function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        width: "100%",
        marginBottom: 12,
        paddingTop: 2,
      }}
    >
      <Link
        href="/"
        prefetch={false}
        style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "inherit" }}
        aria-label="GovAI home"
      >
        <Logo />
      </Link>
      <Link href="/login" prefetch={false} className="govai_btn govai_btnGhost" style={{ flexShrink: 0 }}>
        Sign in
      </Link>
    </header>
  );
}
