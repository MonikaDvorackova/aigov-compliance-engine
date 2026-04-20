import { NextResponse } from "next/server";
import { confirmPasswordReset } from "@/lib/auth/passwordReset/service";

export async function POST(request: Request) {
  let token = "";
  let password = "";
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    token = typeof body.token === "string" ? body.token : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await confirmPasswordReset(token, password);

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }

  if (result.code === "weak_password") {
    return NextResponse.json({ ok: false, error: "weak_password" }, { status: 400 });
  }

  if (result.code === "invalid_or_expired") {
    return NextResponse.json({ ok: false, error: "invalid_or_expired" }, { status: 400 });
  }

  return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
}
