export type SendPasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

/**
 * Sends the password reset email. Uses Resend when RESEND_API_KEY is set; otherwise logs once
 * (without secrets) so local development can proceed without outbound email.
 */
export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.PASSWORD_RESET_EMAIL_FROM ?? "").trim();

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[password-reset] RESEND_API_KEY not set; skipping outbound email (dev). Recipient would be notified in production."
      );
      return;
    }
    console.error(
      "[password-reset] RESEND_API_KEY is not configured; cannot send password reset email."
    );
    return;
  }

  if (!from) {
    console.error("[password-reset] PASSWORD_RESET_EMAIL_FROM is required when using Resend.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "Reset your password",
      text: [
        "We received a request to reset your password for your GovAI dashboard account.",
        "",
        `Reset link (expires in one hour): ${input.resetUrl}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[password-reset] Resend error", res.status, body.slice(0, 500));
  }
}
