import { ApifyClient } from "apify-client";
import { supabaseAdmin } from "./supabase";
import { todayVN } from "./format";
import type { Platform } from "./channels";

/**
 * Pipeline quét dữ liệu qua Apify:
 *  - startDailyScrape(): 05:30 — gom kênh pending + verified, start Actor theo nền tảng (async + webhook)
 *  - handleApifyCallback(): webhook nhận dataset, chuẩn hóa về schema chung, ghi channel_snapshots,
 *    đồng thời xác minh kênh pending bằng mã ID trong bio.
 * Chỉ quét dữ liệu công khai, không dùng Actor yêu cầu cookie đăng nhập.
 */

export type NormalizedProfile = {
  ref: string;            // username / alias nhận diện được từ dữ liệu Apify
  followers: number | null;
  totalViews: number | null;
  videosCount: number | null;
  engagement: number | null;
  bio: string;
  raw: unknown;
};

function apify(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Thiếu APIFY_TOKEN trong .env.local");
  return new ApifyClient({ token });
}

export async function startDailyScrape(): Promise<{ started: { platform: string; runId: string; channels: number }[] }> {
  const db = supabaseAdmin();
  const client = apify();
  const appUrl = process.env.APP_URL || "http://localhost:3300";
  const secret = process.env.APIFY_WEBHOOK_SECRET || "";

  // Quét cả kênh pending (đọc bio để xác minh) lẫn verified (tính điểm)
  const { data: channels } = await db.from("channels").select("*").in("status", ["pending", "verified"]);
  const { data: configs } = await db.from("platform_configs").select("*").eq("is_active", true);

  const started: { platform: string; runId: string; channels: number }[] = [];
  for (const cfg of configs ?? []) {
    const list = (channels ?? []).filter((c) => c.platform === cfg.platform);
    if (!list.length) continue;

    const tpl = (cfg.input_template ?? {}) as {
      channel_key?: string;
      channel_value?: "username" | "url";
      wrap_url?: boolean;
      extra?: Record<string, unknown>;
    };
    const key = tpl.channel_key || "startUrls";
    const values = list.map((c) => (tpl.channel_value === "username" ? c.username : c.url));
    const input: Record<string, unknown> = {
      ...(tpl.extra ?? {}),
      [key]: tpl.wrap_url ? values.map((url) => ({ url })) : values,
    };

    const run = await client.actor(cfg.apify_actor).start(input, {
      webhooks: [
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
          requestUrl: `${appUrl}/api/apify-callback?secret=${encodeURIComponent(secret)}&platform=${cfg.platform}`,
        },
      ],
    });
    await db.from("scrape_runs").insert({
      run_id: run.id,
      platform: cfg.platform,
      actor: cfg.apify_actor,
      status: "started",
      channels_count: list.length,
    });
    started.push({ platform: cfg.platform, runId: run.id, channels: list.length });
  }
  return { started };
}

export async function handleApifyCallback(platform: Platform, payload: any): Promise<{ snapshots: number; verified: number }> {
  const db = supabaseAdmin();
  const runId: string | undefined = payload?.resource?.id;
  const status: string = payload?.resource?.status || payload?.eventType || "";
  const datasetId: string | undefined = payload?.resource?.defaultDatasetId;
  const costUsd = payload?.resource?.usageTotalUsd ?? null;

  if (runId) {
    await db
      .from("scrape_runs")
      .update({
        status: status === "SUCCEEDED" || status === "ACTOR.RUN.SUCCEEDED" ? "succeeded" : "failed",
        cost_usd: costUsd,
        finished_at: new Date().toISOString(),
      })
      .eq("run_id", runId);
  }
  if (!datasetId || !(status.includes("SUCCEEDED"))) return { snapshots: 0, verified: 0 };

  const client = apify();
  const { items } = await client.dataset(datasetId).listItems({ limit: 5000 });
  const profiles = normalizeItems(platform, items as any[]);

  const { data: channels } = await db
    .from("channels")
    .select("*, students!inner(id, public_id)")
    .eq("platform", platform)
    .in("status", ["pending", "verified"]);

  const date = todayVN();
  let snapCount = 0;
  let verifiedCount = 0;

  for (const ch of channels ?? []) {
    const uname = String(ch.username).toLowerCase();
    const prof = profiles.find((p) => {
      const r = p.ref.toLowerCase();
      return r === uname || r === `@${uname}` || r.includes(uname);
    });
    if (!prof) continue;

    // Xác minh quyền sở hữu: bio chứa đúng mã ID cá nhân -> verified + lưu baseline
    if (ch.status === "pending") {
      const publicId: string = (ch as any).students?.public_id ?? "";
      if (publicId && prof.bio.toUpperCase().includes(publicId.toUpperCase())) {
        await db
          .from("channels")
          .update({
            status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: "system",
            baseline_followers: prof.followers,
            baseline_views: prof.totalViews,
          })
          .eq("id", ch.id);
        await db.from("audit_logs").insert({
          actor_id: "system",
          action: "verify_channel_bio",
          target_type: "channel",
          target_id: ch.id,
          detail: { public_id: publicId, followers: prof.followers },
        });
        verifiedCount++;
      }
    }

    const { error } = await db.from("channel_snapshots").upsert(
      {
        channel_id: ch.id,
        snapshot_date: date,
        followers: prof.followers,
        total_views: prof.totalViews,
        videos_count: prof.videosCount,
        engagement: prof.engagement,
        raw: prof.raw,
        scrape_status: "ok",
      },
      { onConflict: "channel_id,snapshot_date" }
    );
    if (!error) snapCount++;
  }
  return { snapshots: snapCount, verified: verifiedCount };
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Chuẩn hóa dataset Apify (mỗi Actor một cấu trúc) về schema chung. Best-effort với nhiều fallback. */
export function normalizeItems(platform: Platform, items: any[]): NormalizedProfile[] {
  if (platform === "tiktok") {
    // clockworks/tiktok-scraper: item = video, kèm authorMeta {name, fans, heart, video, signature}
    const byAuthor = new Map<string, { meta: any; videos: any[] }>();
    for (const it of items) {
      const meta = it.authorMeta ?? it.author ?? null;
      const name = String(meta?.name ?? meta?.uniqueId ?? it.input ?? "").toLowerCase();
      if (!name) continue;
      if (!byAuthor.has(name)) byAuthor.set(name, { meta, videos: [] });
      byAuthor.get(name)!.videos.push(it);
    }
    return Array.from(byAuthor.entries()).map(([name, g]) => {
      const m = g.meta ?? {};
      const engagement = g.videos.reduce(
        (s, v) => s + (num(v.diggCount) ?? 0) + (num(v.shareCount) ?? 0) + (num(v.commentCount) ?? 0),
        0
      );
      const views = g.videos.reduce((s, v) => s + (num(v.playCount) ?? 0), 0);
      return {
        ref: name,
        followers: num(m.fans) ?? num(m.followers),
        totalViews: num(m.heart) != null ? num(m.heart) : views, // heart = tổng like kênh; fallback tổng play
        videosCount: num(m.video) ?? g.videos.length,
        engagement,
        bio: String(m.signature ?? ""),
        raw: { authorMeta: m, sampleVideos: g.videos.slice(0, 3) },
      };
    });
  }

  if (platform === "youtube") {
    // streamers/youtube-scraper: item theo video/kênh với channel* fields
    const byChannel = new Map<string, any[]>();
    for (const it of items) {
      const ref = String(
        it.channelUsername ?? it.channelName ?? it.channelUrl ?? it.aboutChannelInfo?.channelName ?? ""
      ).toLowerCase().replace(/^@/, "");
      if (!ref) continue;
      if (!byChannel.has(ref)) byChannel.set(ref, []);
      byChannel.get(ref)!.push(it);
    }
    return Array.from(byChannel.entries()).map(([ref, list]) => {
      const first = list[0] ?? {};
      const about = first.aboutChannelInfo ?? first;
      return {
        ref,
        followers: num(about.numberOfSubscribers) ?? num(first.numberOfSubscribers) ?? num(first.subscriberCount),
        totalViews: num(about.channelTotalViews) ?? list.reduce((s, v) => s + (num(v.viewCount) ?? 0), 0),
        videosCount: num(about.channelTotalVideos) ?? list.length,
        engagement: list.reduce((s, v) => s + (num(v.likes) ?? 0) + (num(v.commentsCount) ?? 0), 0),
        bio: String(about.channelDescription ?? first.channelDescription ?? ""),
        raw: { about, sample: list.slice(0, 3) },
      };
    });
  }

  if (platform === "instagram") {
    // apify/instagram-scraper (resultsType: details): item = profile
    return items
      .filter((it) => it.username)
      .map((it) => ({
        ref: String(it.username).toLowerCase(),
        followers: num(it.followersCount),
        totalViews: null,
        videosCount: num(it.postsCount),
        engagement: (it.latestPosts ?? []).reduce(
          (s: number, p: any) => s + (num(p.likesCount) ?? 0) + (num(p.commentsCount) ?? 0),
          0
        ),
        bio: String(it.biography ?? ""),
        raw: { profile: { ...it, latestPosts: undefined } },
      }));
  }

  // facebook: apify/facebook-posts-scraper — item = post kèm thông tin trang
  const byPage = new Map<string, any[]>();
  for (const it of items) {
    const ref = String(it.pageName ?? it.user?.name ?? it.facebookUrl ?? "").toLowerCase();
    if (!ref) continue;
    if (!byPage.has(ref)) byPage.set(ref, []);
    byPage.get(ref)!.push(it);
  }
  return Array.from(byPage.entries()).map(([ref, list]) => ({
    ref,
    followers: num(list[0]?.pageFollowers) ?? num(list[0]?.followers),
    totalViews: null,
    videosCount: list.length,
    engagement: list.reduce(
      (s, p) => s + (num(p.likes) ?? 0) + (num(p.shares) ?? 0) + (num(p.comments) ?? 0),
      0
    ),
    bio: String(list[0]?.pageIntro ?? list[0]?.pageAbout ?? ""),
    raw: { sample: list.slice(0, 3) },
  }));
}
