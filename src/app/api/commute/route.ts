import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCommuteState } from "@/lib/commute-playlists";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getCommuteState(user.id);
  return NextResponse.json(state);
}
