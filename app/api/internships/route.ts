import { NextResponse } from "next/server";
import { readListings } from "@/lib/kv";

export const dynamic = "force-dynamic";

export async function GET() {
  const listings = await readListings();
  return NextResponse.json({ listings, count: listings.length });
}
