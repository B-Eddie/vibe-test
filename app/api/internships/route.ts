import { NextRequest, NextResponse } from "next/server";
import { loadInternships } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const interests = parseList(searchParams.get("interests"));
  const city = searchParams.get("city")?.trim() ?? "";

  const { listings, liveSearch } = await loadInternships({ interests, city });

  return NextResponse.json({
    listings,
    count: listings.length,
    liveSearch,
  });
}
