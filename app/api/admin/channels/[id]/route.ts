import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Gỡ kênh (mặc định gỡ mềm: status = removed — giữ nguyên lịch sử snapshot/điểm, ẩn khỏi hệ thống
 * và ngừng quét/tính điểm). Thêm ?hard=1 để xóa hẳn khỏi DB — giải phóng username cho học viên khác
 * đăng ký lại (snapshot bị xóa theo, dòng điểm cũ giữ lại với channel_id = null).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const hard = req.nextUrl.searchParams.get("hard") === "1";
  const reason = req.nextUrl.searchParams.get("reason") || null;

  const { data: ch } = await db.from("channels").select("*").eq("id", params.id).maybeSingle();
  if (!ch) return jsonError("Không tìm thấy kênh", 404);
  if (!hard && ch.status === "removed") return jsonError("Kênh đã được gỡ trước đó");

  if (hard) {
    const { error } = await db.from("channels").delete().eq("id", ch.id);
    if (error) return jsonError("Không xóa được kênh", 500);
  } else {
    const { error } = await db.from("channels").update({ status: "removed" }).eq("id", ch.id);
    if (error) return jsonError("Không gỡ được kênh", 500);
  }

  await db.from("audit_logs").insert({
    actor_id: "admin",
    action: hard ? "delete_channel" : "remove_channel",
    target_type: "channel",
    target_id: ch.id,
    detail: { platform: ch.platform, username: ch.username, previous_status: ch.status, reason },
  });
  return NextResponse.json({ ok: true, hard });
}

/** Khôi phục kênh đã gỡ — quay về trạng thái chờ xác minh, lần quét kế tiếp sẽ xác minh lại qua bio. */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();

  const { data: ch } = await db.from("channels").select("*").eq("id", params.id).maybeSingle();
  if (!ch) return jsonError("Không tìm thấy kênh", 404);
  if (ch.status !== "removed") return jsonError("Kênh này chưa bị gỡ");

  const { error } = await db.from("channels").update({ status: "pending" }).eq("id", ch.id);
  if (error) return jsonError("Không khôi phục được kênh", 500);

  await db.from("audit_logs").insert({
    actor_id: "admin",
    action: "restore_channel",
    target_type: "channel",
    target_id: ch.id,
    detail: { platform: ch.platform, username: ch.username },
  });
  return NextResponse.json({ ok: true });
}
