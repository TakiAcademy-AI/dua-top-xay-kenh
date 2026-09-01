import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStudent } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Lịch sử cộng điểm chi tiết của chính học viên (minh bạch từng dòng). */
export async function GET(req: NextRequest) {
  const auth = requireStudent();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  let q = db
    .from("score_entries")
    .select("entry_date, metric, raw_value, weight, points, note, created_by, channels(platform, username)")
    .eq("student_id", auth.session.sid!)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data } = await q;

  return NextResponse.json({
    entries: (data ?? []).map((e: any) => ({
      entry_date: e.entry_date,
      metric: e.metric,
      raw_value: e.raw_value === null ? null : Number(e.raw_value),
      weight: e.weight === null ? null : Number(e.weight),
      points: Number(e.points),
      note: e.note,
      manual: e.created_by !== null,
      channel: e.channels ? `${e.channels.platform}:@${e.channels.username}` : null,
    })),
  });
}
