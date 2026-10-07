import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTemplate, updateTemplate } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

const Patch = z
  .object({ name: z.string().trim().min(1).max(60), active: z.boolean(), sortOrder: z.number().int() })
  .partial()
  .strict();

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/templates/[id]">) {
  const { id } = await ctx.params;
  try {
    const parsed = Patch.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
    return NextResponse.json(await updateTemplate(id, parsed.data));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/templates/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
