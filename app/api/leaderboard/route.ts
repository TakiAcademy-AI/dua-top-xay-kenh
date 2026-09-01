import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const METRICS = ["follower", "views", "new_video", "engagement", "weekly_bonus", "manual_adjust"] as const;

/**
 * Bảng xếp hạng public — không bao giờ trả SĐT. Cache CDN 5 phút.
 * ?detail=1: kèm điểm thành phần từng chỉ số, điểm hôm nay, số kênh đã xác minh của mỗi học viên.
 */
export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const detail = req.nextUrl.searchParams.get("detail") === "1";
  if (!campaignId) return jsonError("Thiếu campaign_id");
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("campaign_participants")
    .select("student_id, total_score, current_rank, prev_rank, rank_updated_on, students!inner(public_id, full_name, class_id, classes(name))")
    .eq("campaign_id", campaignId)
    .limit(500);
  if (error) return jsonError("Không đọc được bảng xếp hạng", 500);

  let breakdownByStudent = new Map<string, Record<string, number>>();
  let todayByStudent = new Map<string, number>();
  let lastEntryDate: string | null = null;
  let channelsByStudent = new Map<string, number>();

  if (detail) {
    const { data: entries } = await db
      .from("score_entries")
      .select("student_id, metric, points, entry_date")
      .eq("campaign_id", campaignId);
    for (const e of entries ?? []) {
      if (!lastEntryDate || e.entry_date > lastEntryDate) lastEntryDate = e.entry_date;
    }
    for (const e of entries ?? []) {
      if (!breakdownByStudent.has(e.student_id)) breakdownByStudent.set(e.student_id, {});
      const b = breakdownByStudent.get(e.student_id)!;
      b[e.metric] = (b[e.metric] ?? 0) + Number(e.points);
      if (e.entry_date === lastEntryDate) {
        todayByStudent.set(e.student_id, (todayByStudent.get(e.student_id) ?? 0) + Number(e.points));
      }
    }
    const ids = (data ?? []).map((r: any) => r.student_id);
    if (ids.length) {
      const { data: chans } = await db
        .from("channels")
        .select("student_id")
        .in("student_id", ids)
        .eq("status", "verified");
      for (const c of chans ?? []) {
        channelsByStudent.set(c.student_id, (channelsByStudent.get(c.student_id) ?? 0) + 1);
      }
    }
  }

  const rows = (data ?? [])
    .map((r: any) => {
      const base = {
        student_id: r.student_id,
        rank: r.current_rank,
        prev_rank: r.prev_rank,
        name: r.students.full_name,
        public_id: r.students.public_id,
        class_name: r.students.classes?.name ?? null,
        total_score: Number(r.total_score),
        updated_on: r.rank_updated_on,
      };
      if (!detail) return base;
      const b = breakdownByStudent.get(r.student_id) ?? {};
      return {
        ...base,
        breakdown: Object.fromEntries(METRICS.map((m) => [m, Math.round((b[m] ?? 0) * 100) / 100])),
        today_points: Math.round((todayByStudent.get(r.student_id) ?? 0) * 100) / 100,
        verified_channels: channelsByStudent.get(r.student_id) ?? 0,
      };
    })
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  return NextResponse.json(
    { rows, last_entry_date: lastEntryDate },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}
