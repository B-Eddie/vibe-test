import { NextRequest, NextResponse } from "next/server";
import { fillApplicationAnswers } from "@/lib/apply-fill";
import type { ParsedApplication, StudentProfile } from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: {
    profile?: StudentProfile;
    application?: ParsedApplication;
    opportunityContext?: string;
    onlyEntryIds?: string[];
    pathContext?: string;
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

  const only = body.onlyEntryIds?.length
    ? new Set(body.onlyEntryIds)
    : null;

  const scopedApplication: ParsedApplication = only
    ? {
        ...body.application,
        questions: body.application.questions.filter((q) =>
          only.has(q.entryId),
        ),
      }
    : body.application;

  if (!scopedApplication.questions.length) {
    return NextResponse.json({
      answers: [],
      provider: "local-fallback",
      geminiError: null,
      geminiModel: null,
    });
  }

  const result = await fillApplicationAnswers({
    profile,
    application: scopedApplication,
    opportunityContext: [
      body.opportunityContext,
      body.pathContext,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return NextResponse.json(result);
}
