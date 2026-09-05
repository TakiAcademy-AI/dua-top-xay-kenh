import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";
import { sanitizePrizes } from "@/lib/prizes";
import { autoStartCampaigns } from "@/lib/scoring";
import { todayVN } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Danh sách chiến dịch + 3 số tổng quan. */
export async function GET() {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();

  await autoStartCampaigns(todayVN());
  const { data: camps } = await db
    .from("campaigns")
    .select("*, campaign_classes(class_id, classes(name))")
    .order("created_at", { ascending: false });

  const { data: parts } = await db.from("campaign_participants").select("campaign_id, student_id");
  const countByCamp = new Map<string, number>();
  const runningStudents = new Set<string>();
  const runningIds = new Set((camps ?? []).filter((c) => c.status === "running").map((c) => c.id));
  for (const p of parts ?? []) {
    countByCamp.set(p.campaign_id, (countByCamp.get(p.campaign_id) ?? 0) + 1);
    if (runningIds.has(p.campaign_id)) runningStudents.add(p.student_id);
  }
  const { count: channelCount } = await db
    .from("channels")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "verified", "flagged"]);

  return NextResponse.json({
    stats: {
      running: runningIds.size,
      students: runningStudents.size,
      channels: channelCount ?? 0,
    },
    campaigns: (camps ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      scope: c.scope,
      class_names: (c.campaign_classes ?? []).map((cc: any) => cc.classes?.name).filter(Boolean),
      class_ids: (c.campaign_classes ?? []).map((cc: any) => cc.class_id).filter(Boolean),
      start_date: c.start_date,
      end_date: c.end_date,
      registration_deadline: c.registration_deadline,
      prize: c.prize,
      prizes: c.prizes ?? [],
      weights: c.weights,
      weekly_quota: c.weekly_quota,
      status: c.status,
      participants: countByCamp.get(c.id) ?? 0,
    })),
  });
}

/** Tạo chiến dịch mới. */
export async function POST(req: NextRequest) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Dữ liệu không hợp lệ");

  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("Vui lòng nhập tên chiến dịch");
  const scope = ["class", "global", "industry"].includes(body.scope) ? body.scope : "class";
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  if (!startDate || !endDate) return jsonError("Vui lòng chọn ngày bắt đầu và kết thúc");
  if (endDate <= startDate) return jsonError("Ngày kết thúc phải sau ngày bắt đầu");
  const deadline = body.registration_deadline ? String(body.registration_deadline) : null;
  if (deadline && (deadline < startDate || deadline > endDate)) {
    return jsonError("Hạn chốt đăng ký phải nằm trong khoảng chiến dịch");
  }

  const w = body.weights ?? {};
  const weights = {
    follower: Number(w.follower ?? 10),
    per_1000_views: Number(w.per_1000_views ?? 5),
    new_video: Number(w.new_video ?? 20),
    engagement: Number(w.engagement ?? 2),
    weekly_bonus: Number(w.weekly_bonus ?? 100),
  };
  if (Object.values(weights).some((v) => !Number.isFinite(v) || v < 0)) {
    return jsonError("Trọng số không được âm");
  }

  const { data: camp, error } = await db
    .from("campaigns")
    .insert({
      name,
      scope,
      start_date: startDate,
      end_date: endDate,
      registration_deadline: deadline,
      prize: body.prize ? String(body.prize) : null,
      prizes: sanitizePrizes(body.prizes),
      weights,
      weekly_quota: Math.max(0, Number(body.weekly_quota ?? 0) | 0),
      normalize_by_baseline: body.normalize_by_baseline !== false,
      status: "open",
      created_by: "admin",
    })
    .select()
    .single();
  if (error) return jsonError("Không tạo được chiến dịch", 500);

  const classIds: string[] = Array.isArray(body.class_ids) ? body.class_ids.filter(Boolean) : [];
  if (scope === "class" && classIds.length) {
    await db.from("campaign_classes").insert(classIds.map((cid) => ({ campaign_id: camp.id, class_id: cid })));
  }
  await db.from("audit_logs").insert({
    actor_id: "admin", action: "create_campaign", target_type: "campaign", target_id: camp.id, detail: { name },
  });
  return NextResponse.json({ campaign: camp });
}
