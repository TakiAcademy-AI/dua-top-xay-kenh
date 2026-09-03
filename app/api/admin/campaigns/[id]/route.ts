import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";
import { sanitizePrizes } from "@/lib/prizes";

export const dynamic = "force-dynamic";

/**
 * Sửa/đổi trạng thái chiến dịch.
 * - Thông tin + công thức chỉ sửa được khi draft/open (đóng băng khi đã chạy — chống thay luật giữa cuộc đua).
 * - action: pause | resume | finish (kết thúc sớm, UI phải xác nhận 2 bước).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Dữ liệu không hợp lệ");

  const { data: camp } = await db.from("campaigns").select("*").eq("id", params.id).maybeSingle();
  if (!camp) return jsonError("Không tìm thấy chiến dịch", 404);

  if (body.action) {
    const transitions: Record<string, { from: string[]; to: string }> = {
      pause: { from: ["running"], to: "paused" },
      resume: { from: ["paused"], to: "running" },
      finish: { from: ["running", "paused", "open"], to: "finished" },
    };
    const t = transitions[body.action];
    if (!t) return jsonError("action không hợp lệ");
    if (!t.from.includes(camp.status)) return jsonError(`Không thể ${body.action} khi trạng thái là ${camp.status}`);
    await db.from("campaigns").update({ status: t.to }).eq("id", camp.id);
    await db.from("audit_logs").insert({
      actor_id: "admin", action: `campaign_${body.action}`, target_type: "campaign", target_id: camp.id,
      detail: { from: camp.status, to: t.to },
    });
    return NextResponse.json({ ok: true, status: t.to });
  }

  // Giải thưởng tùy biến được MỌI LÚC — không thuộc luật tính điểm nên không bị đóng băng
  const prizePatch: Record<string, unknown> = {};
  if (body.prize !== undefined) prizePatch.prize = body.prize ? String(body.prize).slice(0, 200) : null;
  if (body.prizes !== undefined) prizePatch.prizes = sanitizePrizes(body.prizes);

  const patch: Record<string, unknown> = {};
  for (const f of ["name", "start_date", "end_date", "registration_deadline", "weekly_quota", "weights", "normalize_by_baseline"]) {
    if (body[f] !== undefined) patch[f] = body[f];
  }

  // Chỉ sửa giải thưởng: áp dụng ngay, bỏ qua kiểm tra đóng băng
  if (!Object.keys(patch).length && Object.keys(prizePatch).length) {
    const { error } = await db.from("campaigns").update(prizePatch).eq("id", camp.id);
    if (error) return jsonError("Không cập nhật được giải thưởng", 500);
    await db.from("audit_logs").insert({
      actor_id: "admin", action: "update_campaign_prizes", target_type: "campaign", target_id: camp.id, detail: prizePatch as any,
    });
    return NextResponse.json({ ok: true });
  }

  // Sửa thông tin / công thức: chỉ khi chưa bắt đầu
  if (!["draft", "open"].includes(camp.status)) {
    return jsonError("Chiến dịch đã bắt đầu — công thức và thông tin bị đóng băng (riêng giải thưởng vẫn sửa được). Muốn sửa luật phải kết thúc chiến dịch.");
  }
  Object.assign(patch, prizePatch);
  const start = String(patch.start_date ?? camp.start_date);
  const end = String(patch.end_date ?? camp.end_date);
  if (end <= start) return jsonError("Ngày kết thúc phải sau ngày bắt đầu");
  if (patch.weights && Object.values(patch.weights as Record<string, number>).some((v) => Number(v) < 0)) {
    return jsonError("Trọng số không được âm");
  }
  const { error } = await db.from("campaigns").update(patch).eq("id", camp.id);
  if (error) return jsonError("Không cập nhật được", 500);
  await db.from("audit_logs").insert({
    actor_id: "admin", action: "update_campaign", target_type: "campaign", target_id: camp.id, detail: patch as any,
  });
  return NextResponse.json({ ok: true });
}
