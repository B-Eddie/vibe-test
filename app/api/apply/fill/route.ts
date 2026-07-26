import { NextRequest, NextResponse } from "next/server";
import { fillApplicationAnswers } from "@/lib/apply-fill";
import type { ParsedApplication, StudentProfile } from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: {
    profile?: StudentProfile;
    application?: ParsedApplication;
    opportunityContext?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.application) {
    return NextResponse.json(
      { error: "application is required" },
      { status: 400 },
    );
  }

  const profile: StudentProfile = {
    ...EMPTY_PROFILE,
    ...(body.profile ?? {}),
    interests: body.profile?.interests ?? [],
    skills: body.profile?.skills ?? [],
    customFacts: body.profile?.customFacts ?? [],
  };

  const result = await fillApplicationAnswers({
    profile,
    application: body.application,
    opportunityContext: body.opportunityContext,
  });

  return NextResponse.json(result);
}
