import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dbOk = checkDatabaseHealth();
    return NextResponse.json({
      status: dbOk ? "ok" : "degraded",
      database: dbOk ? "connected" : "error",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
