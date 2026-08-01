import { NextResponse } from "next/server";
import { getHackClubKey, getGeminiKey } from "@/lib/ai";
import { probeGemini, GEMINI_MODEL } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const probe = await probeGemini();
  return NextResponse.json({
    hackClubConfigured: Boolean(getHackClubKey()),
    geminiConfigured: Boolean(getGeminiKey()),
    aiConfigured: Boolean(getHackClubKey() || getGeminiKey()),
    aiOk: probe.ok,
    aiProvider: probe.provider,
    aiModel: probe.model || (getHackClubKey() ? "qwen/qwen3-32b" : GEMINI_MODEL),
    geminiOk: probe.ok,
    geminiModel: probe.model || GEMINI_MODEL,
    geminiError: probe.error,
  });
}
