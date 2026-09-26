import { NextResponse } from "next/server";
import { AI_MODEL, isAIEnabled } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ enabled: isAIEnabled(), model: isAIEnabled() ? AI_MODEL : null });
}
