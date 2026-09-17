import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkCronSecret, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Extension hỏi mỗi phút: có yêu cầu quét reel mới không (do admin bấm "Quét")?
 *  Trả true đúng 1 lần cho mỗi yêu cầu (đánh dấu đã nhận để không chạy lặp). */
export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) return jsonError("Sai secret", 401);
  const db = supabaseAdmin();
  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["ext_scrape_request", "ext_scrape_done"]);
  const map: Record<string, number> = {};
  for (const r of data ?? []) map[r.key] = Number(r.value) || 0;
  const request = map.ext_scrape_request || 0;
  const done = map.ext_scrape_done || 0;
  // Yêu cầu mới (chưa nhận) và còn tươi (<10 phút) thì mới bảo extension chạy
  const scrape = request > done && Date.now() - request < 10 * 60_000;
  if (scrape) {
    await db.from("app_settings").upsert({ key: "ext_scrape_done", value: String(request) }, { onConflict: "key" });
  }
  return NextResponse.json({ scrape });
}
