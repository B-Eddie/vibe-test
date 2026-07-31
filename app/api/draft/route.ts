import { NextRequest, NextResponse } from "next/server";
import type { Internship, StudentProfile } from "@/lib/types";
import { geminiText, getApiKey } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DraftBody = {
  profile: StudentProfile;
  internship: Internship;
};

function extractJsonObject(content: string): {
  coverEmail?: string;
  whyMe?: string;
} | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || content.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as {
      coverEmail?: string;
      whyMe?: string;
    };
  } catch {
    return null;
  }
}

function localFallbackDraft(profile: StudentProfile, internship: Internship) {
  const name = profile.name || "Applicant";
  const skills =
    profile.skills.slice(0, 4).join(", ") || "curiosity and initiative";
  const interests =
    profile.interests.slice(0, 3).join(", ") || "learning and research";

  const coverEmail = `Subject: Application for ${internship.title}

Dear ${internship.org} team,

My name is ${name}, and I am a grade ${profile.grade || "11"} student${
    profile.city ? ` based in ${profile.city}` : ""
  }. I am writing to apply for the ${internship.title} opportunity.

I am especially interested in ${interests}, and I bring experience with ${skills}. ${
    profile.bio ||
    "I am eager to contribute, learn quickly, and take ownership of meaningful work."
  }

Thank you for considering my application. I would welcome the chance to contribute to ${internship.org}.

Sincerely,
${name}`;

  const whyMe = `I am a strong fit for ${internship.title} because my interests in ${interests} align with this role, and I can contribute ${skills}. As a high school student, I am motivated, coachable, and ready to deliver careful, reliable work.`;

  return { coverEmail, whyMe, provider: "local-fallback" as const };
}

export async function POST(request: NextRequest) {
  let body: DraftBody;
  try {
    body = (await request.json()) as DraftBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.profile || !body?.internship) {
    return NextResponse.json(
      { error: "profile and internship are required" },
      { status: 400 },
    );
  }

  const fallback = localFallbackDraft(body.profile, body.internship);
  if (!getApiKey()) {
    return NextResponse.json(fallback);
  }

  const content = await geminiText({
    json: true,
    system:
      "You help a high school student draft internship application materials. Reply with ONLY valid JSON with keys coverEmail and whyMe. Always return non-empty drafts. Prefer profile facts; when details are missing, write a sincere editable draft grounded in grade/school/interests/skills and the opportunity. Do not invent specific awards, GPAs, or employers not in the profile. Do not submit anything; drafting only.",
    user: JSON.stringify({
      profile: body.profile,
      internship: {
        title: body.internship.title,
        org: body.internship.org,
        description: body.internship.description,
        tags: body.internship.tags,
        location: body.internship.location,
      },
    }),
  });

  if (!content) {
    return NextResponse.json(fallback);
  }

  const parsed = extractJsonObject(content);
  return NextResponse.json({
    coverEmail: parsed?.coverEmail ?? fallback.coverEmail,
    whyMe: parsed?.whyMe ?? fallback.whyMe,
    provider: "gemini" as const,
  });
}
