import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { startCommuteWeekGeneration } from "@/lib/commute-playlists";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await startCommuteWeekGeneration(user.id, {
      trigger: "manual",
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to start weekly commute generation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
