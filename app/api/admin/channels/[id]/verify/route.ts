import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Xác minh tay một kênh (trường hợp đặc biệt) — luôn ghi log ai duyệt, lúc nào. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const { data: ch } = await db.from("channels").select("*").eq("id", params.id).maybeSingle();
  if (!ch) return jsonError("Không tìm thấy kênh", 404);
  if (ch.status === "removed") return jsonError("Kênh đã bị gỡ");

  // Baseline: ưu tiên số admin nhập, sau đó snapshot mới nhất, cuối cùng giữ nguyên
  let baselineFollowers = body?.baseline_followers != null ? Number(body.baseline_followers) : null;
  let baselineViews = body?.baseline_views != null ? Number(body.baseline_views) : null;
  if (baselineFollowers === null) {
    const { data: snap } = await db
      .from("channel_snapshots")
      .select("followers, total_views")
      .eq("channel_id", ch.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    baselineFollowers = snap?.followers ?? ch.baseline_followers ?? 0;
    baselineViews = baselineViews ?? (snap?.total_views != null ? Number(snap.total_views) : ch.baseline_views ?? 0);
  }

  const { error } = await db
    .from("channels")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: "admin",
      baseline_followers: baselineFollowers,
      baseline_views: baselineViews,
    })
    .eq("id", ch.id);
  if (error) return jsonError("Không cập nhật được", 500);

  await db.from("audit_logs").insert({
    actor_id: "admin", action: "verify_channel_manual", target_type: "channel", target_id: ch.id,
    detail: { previous_status: ch.status, baseline_followers: baselineFollowers, baseline_views: baselineViews },
  });
  return NextResponse.json({ ok: true });
}
