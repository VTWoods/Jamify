import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { commuteConfigs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ensureCommuteConfigs } from "@/lib/commute-playlists";

export const dynamic = "force-dynamic";

const patchConfigSchema = z.object({
  kind: z.enum(["morning", "evening"]),
  name: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchConfigSchema.parse(await request.json());
    await ensureCommuteConfigs(user.id);

    const db = getDb();
    const patch: Partial<typeof commuteConfigs.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) patch.name = body.name;
    if (body.enabled !== undefined) patch.enabled = body.enabled;

    await db
      .update(commuteConfigs)
      .set(patch)
      .where(
        and(
          eq(commuteConfigs.userId, user.id),
          eq(commuteConfigs.kind, body.kind),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid commute playlist settings." },
        { status: 400 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to update settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
