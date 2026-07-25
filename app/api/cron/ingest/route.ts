import { NextRequest, NextResponse } from "next/server";
import { writeListings } from "@/lib/kv";
import { ingestAllSources } from "@/lib/ingest/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listings = await ingestAllSources();
  await writeListings(listings);

  return NextResponse.json({
    ok: true,
    count: listings.length,
    sources: [...new Set(listings.map((item) => item.source))],
    ingestedAt: new Date().toISOString(),
  });
}
