import { NextResponse } from "next/server";

import { loadConfirmedStore } from "@/lib/ai-discovery/loadConfirmedStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  type?: "openai" | "transformers" | "model_artifact";
  file?: string;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Expected JSON body." },
      { status: 400 }
    );
  }

  const t = body.type;
  const file = typeof body.file === "string" ? body.file.trim() : "";
  if (
    t !== "openai" &&
    t !== "transformers" &&
    t !== "model_artifact"
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_type", message: "Invalid type." },
      { status: 400 }
    );
  }
  if (!file) {
    return NextResponse.json(
      { ok: false, error: "invalid_file", message: "file is required." },
      { status: 400 }
    );
  }

  const { addConfirmedSystem } = await loadConfirmedStore();
  const { record, created } = addConfirmedSystem({ detectionType: t, file });
  return NextResponse.json(
    { ok: true, existing: !created, ...record },
    { status: created ? 201 : 200 }
  );
}
