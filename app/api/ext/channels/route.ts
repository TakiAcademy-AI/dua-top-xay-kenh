import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkCronSecret, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Extension trình duyệt gọi để lấy danh sách kênh Facebook cần đếm reel. Auth = CRON_SECRET. */
export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) return jsonError("Sai secret", 401);
  const db = supabaseAdmin();
  const { data } = await db
    .from("channels")
    .select("id, username")
    .eq("status", "verified")
    .eq("platform", "facebook");
  const channels = (data ?? []).map((c) => ({
    channel_id: c.id,
    username: c.username,
    reels_url: /^\d+$/.test(c.username)
      ? `https://www.facebook.com/profile.php?id=${c.username}&sk=reels_tab`
      : `https://www.facebook.com/${c.username}/reels`,
  }));
  return NextResponse.json({ channels });
}
