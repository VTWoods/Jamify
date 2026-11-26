import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { startRecommendationRefresh } from "@/lib/gemini-recommendations";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await startRecommendationRefresh(user.id);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to start Gemini recommendations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
