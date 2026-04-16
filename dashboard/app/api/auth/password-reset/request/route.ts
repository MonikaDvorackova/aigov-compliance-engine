import { NextResponse, type NextRequest } from "next/server";
import { requestPasswordReset } from "@/lib/auth/passwordReset/service";

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = typeof body.email === "string" ? body.email : "";
  } catch {
    email = "";
  }

  await requestPasswordReset(email, request);

  return NextResponse.json({
    ok: true,
    message: "If an account exists for this email, we sent a password reset link.",
  });
}
