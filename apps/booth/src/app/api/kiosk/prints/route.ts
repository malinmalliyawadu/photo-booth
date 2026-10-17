import { NextResponse } from "next/server";
import { listFindablePrints } from "@booth/db";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** The evening's prints, for the kiosk's "Print a copy" wall. */
export async function GET() {
  try {
    return NextResponse.json({ prints: await listFindablePrints() });
  } catch (err) {
    return errorResponse(err);
  }
}
