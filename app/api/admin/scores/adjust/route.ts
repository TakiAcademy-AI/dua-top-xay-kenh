import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";
import { todayVN } from "@/lib/format";
import { recomputeRanks } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/** Điều chỉnh điểm tay — bắt buộc nhập lý do, ghi log, cập nhật lại hạng ngay. */
export async function POST(req: NextRequest) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Dữ liệu không hợp lệ");

  const campaignId = String(body.campaign_id ?? "");
  const studentId = String(body.student_id ?? "");
  const points = Number(body.points);
  const note = String(body.note ?? "").trim();
  if (!campaignId || !studentId) return jsonError("Thiếu campaign_id hoặc student_id");
  if (!Number.isFinite(points) || points === 0) return jsonError("Số điểm điều chỉnh không hợp lệ");
  if (!note) return jsonError("Bắt buộc nhập lý do điều chỉnh");

  const today = todayVN();
  const { error } = await db.from("score_entries").insert({
    campaign_id: campaignId,
    student_id: studentId,
    entry_date: today,
    metric: "manual_adjust",
    raw_value: points,
    weight: 1,
    points,
    note,
    created_by: "admin",
  });
  if (error) return jsonError("Không ghi được điều chỉnh (học viên có tham gia chiến dịch này không?)", 500);

  await db.from("audit_logs").insert({
    actor_id: "admin", action: "adjust_score", target_type: "student", target_id: studentId,
    detail: { campaign_id: campaignId, points, note },
  });
  await recomputeRanks(campaignId, today);
  return NextResponse.json({ ok: true });
}
