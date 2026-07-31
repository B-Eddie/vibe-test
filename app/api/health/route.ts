import { NextResponse } from "next/server";
import { probeGemini, getApiKey, GEMINI_MODEL } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const probe = await probeGemini();
  return NextResponse.json({
    geminiConfigured: Boolean(getApiKey()),
    geminiOk: probe.ok,
    geminiModel: probe.model || GEMINI_MODEL,
    geminiError: probe.error,
  });
}
