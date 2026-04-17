import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const body = await request.json().catch(() => ({}));

    const requestEffort = body.reasoning_effort || null;
    const defaultEffort = settings.defaultReasoningEffort || null;

    // Simulate exact chat.js logic
    let appliedEffort = requestEffort;
    let source = "explicit_from_request";

    if (!requestEffort && defaultEffort) {
      appliedEffort = defaultEffort;
      source = "default_from_settings";
    } else if (!requestEffort && !defaultEffort) {
      appliedEffort = null;
      source = "none";
    }

    // Gemini budget mapping (openai-to-gemini.js)
    const geminiBudgetMap = { low: 1024, medium: 8192, high: 32768, xhigh: 32768 };
    const geminiBudget = appliedEffort ? (geminiBudgetMap[appliedEffort] || 8192) : null;

    // Codex mapping (codex.js)
    const codexEffort = appliedEffort || "medium";

    // OpenAI direct pass-through
    const openaiEffort = appliedEffort;

    return NextResponse.json({
      test: true,
      timestamp: new Date().toISOString(),
      input: {
        requestEffort,
        defaultEffort,
      },
      result: {
        appliedEffort,
        source,
      },
      providerMapping: {
        gemini: {
          thinkingBudget: geminiBudget,
          label: geminiBudget ? `${geminiBudget.toLocaleString()} tokens` : "disabled",
        },
        codex: {
          effort: codexEffort,
          label: `reasoning.effort = "${codexEffort}"`,
        },
        openai: {
          effort: openaiEffort,
          label: openaiEffort ? `reasoning_effort = "${openaiEffort}"` : "not set",
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
