import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkCronSecret, jsonError } from "@/lib/api";
import { todayVN } from "@/lib/format";
import { runDailyScoring } from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Extension gửi kết quả đếm reel về đây -> ghi total_views + videos_count vào snapshot hôm nay.
 *  body: { results: [{ channel_id, videos_count, total_views }] }. Auth = CRON_SECRET. */
export async function POST(req: NextRequest) {
  if (!checkCronSecret(req)) return jsonError("Sai secret", 401);
  const body = await req.json().catch(() => null);
  const results: any[] = Array.isArray(body?.results) ? body.results : [];
  if (!results.length) return NextResponse.json({ ok: 0 });

  const db = supabaseAdmin();
  const today = todayVN();
  let ok = 0;
  for (const r of results) {
    if (!r?.channel_id || r?.videos_count == null) continue;
    const { error } = await db.from("channel_snapshots").upsert(
      {
        channel_id: r.channel_id,
        snapshot_date: today,
        total_views: Number(r.total_views) || 0,
        videos_count: Number(r.videos_count) || 0,
        scrape_status: "ok",
      },
      { onConflict: "channel_id,snapshot_date" }
    );
    if (!error) ok++;
  }

  // Chấm điểm lại NGAY sau khi có view/reel mới -> Sếp chỉ cần bấm extension, khỏi vào admin.
  let scored = 0;
  try {
    const report = await runDailyScoring(today);
    scored = report.entries;
  } catch (e) {
    /* lỗi chấm điểm không chặn việc ghi reel */
  }
  return NextResponse.json({ ok, received: results.length, scored });
}
