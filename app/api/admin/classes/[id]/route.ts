import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Admin xóa lớp: chưa có học viên/chiến dịch thì xóa hẳn, đã dùng rồi thì ẩn (is_active=false) để giữ dữ liệu. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();

  const { data: cls } = await db.from("classes").select("id, name").eq("id", params.id).maybeSingle();
  if (!cls) return jsonError("Không tìm thấy lớp", 404);

  const { count: studentCount } = await db
    .from("students").select("id", { count: "exact", head: true }).eq("class_id", cls.id);
  const { count: campaignCount } = await db
    .from("campaign_classes").select("campaign_id", { count: "exact", head: true }).eq("class_id", cls.id);

  if ((studentCount ?? 0) > 0 || (campaignCount ?? 0) > 0) {
    const { error } = await db.from("classes").update({ is_active: false }).eq("id", cls.id);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ deactivated: true, name: cls.name, students: studentCount ?? 0, campaigns: campaignCount ?? 0 });
  }

  const { error } = await db.from("classes").delete().eq("id", cls.id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ deleted: true, name: cls.name });
}
