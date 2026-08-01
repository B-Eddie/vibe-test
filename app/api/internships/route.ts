import { NextRequest, NextResponse } from "next/server";
import { loadInternships } from "@/lib/gemini";
import type { StudentGender } from "@/lib/types";

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

function parseGender(value: string | null): StudentGender {
  if (
    value === "male" ||
    value === "female" ||
    value === "nonbinary" ||
    value === "prefer-not"
  ) {
    return value;
  }
  return "";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const interests = parseList(searchParams.get("interests"));
  const city = searchParams.get("city")?.trim() ?? "";
  const gender = parseGender(searchParams.get("gender"));
  const includeAffinity = searchParams.get("includeAffinity") === "1";

  const { listings, liveSearch, liveCount, error } = await loadInternships({
    interests,
    city,
    gender,
    includeAffinity,
  });

  return NextResponse.json({
    listings,
    count: listings.length,
    liveSearch,
    liveCount,
    error,
  });
}
