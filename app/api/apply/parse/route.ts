import { NextRequest, NextResponse } from "next/server";
import { parseApplicationUrl } from "@/lib/google-forms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.url?.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const application = await parseApplicationUrl(body.url.trim());
    return NextResponse.json({ application });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse application";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
