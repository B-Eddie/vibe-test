import { NextRequest, NextResponse } from "next/server";
import { submitGoogleForm } from "@/lib/google-forms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let body: {
    submitUrl?: string;
    answers?: Record<string, string>;
    fbzx?: string | null;
    confirm?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.confirm) {
    return NextResponse.json(
      { error: "Set confirm:true after reviewing answers" },
      { status: 400 },
    );
  }

  if (!body.submitUrl || !body.answers) {
    return NextResponse.json(
      { error: "submitUrl and answers are required" },
      { status: 400 },
    );
  }

  try {
    const result = await submitGoogleForm({
      submitUrl: body.submitUrl,
      answers: body.answers,
      fbzx: body.fbzx ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Submit failed";
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
