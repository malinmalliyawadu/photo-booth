import { NextResponse } from "next/server";
import { readSnapshot } from "@booth/db";

export const dynamic = "force-dynamic";

/** The same snapshot the stream sends, for tests and for a quick look. */
export async function GET() {
  return NextResponse.json(await readSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
