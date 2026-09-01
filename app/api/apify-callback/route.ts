import { NextRequest, NextResponse } from "next/server";
import { handleApifyCallback } from "@/lib/apify";
import { jsonError } from "@/lib/api";
import { PLATFORMS, Platform } from "@/lib/channels";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Webhook Apify gọi khi run xong — xác thực bằng secret token trên query string. */
export async function POST(req: NextRequest) {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret || req.nextUrl.searchParams.get("secret") !== secret) {
    return jsonError("Sai secret", 401);
  }
  const platform = req.nextUrl.searchParams.get("platform") as Platform;
  if (!PLATFORMS.includes(platform)) return jsonError("platform không hợp lệ");

  const payload = await req.json().catch(() => null);
  if (!payload) return jsonError("Payload không hợp lệ");

  try {
    const result = await handleApifyCallback(platform, payload);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[apify-callback]", e);
    return jsonError(e.message ?? "Lỗi xử lý callback", 500);
  }
}
