"use client";

import { useEffect, useState } from "react";
import { Countdown, ProfileModal, SiteHeader } from "@/components/ui";
import { LeaderboardBoard } from "@/components/leaderboard";
import { AppShell } from "@/components/sidebar";

type Prize = { label: string; reward: string };
type ClassData = {
  class: { id: string; name: string; code: string; students: number };
  campaigns: { id: string; name: string; prize: string | null; prizes: Prize[]; status: string; start_date: string; end_date: string }[];
  primary_campaign: { id: string; name: string; prize: string | null; prizes: Prize[]; end_date: string; registration_deadline: string | null } | null;
};

function prizeList(prizes: Prize[] | undefined, prize: string | null): Prize[] {
  if (prizes?.length) return prizes;
  return prize ? [{ label: "Giải thưởng", reward: prize }] : [];
}

const dmy = (d: string) => d.split("-").reverse().join("/");
const STATUS_LABEL: Record<string, [string, string]> = {
  running: ["pill-live", "Đang chạy"],
  open: ["pill-soon", "Mở đăng ký"],
  paused: ["pill-warn", "Tạm dừng"],
  finished: ["pill-done", "Đã kết thúc"],
  draft: ["pill-soon", "Nháp"],
};

export default function ClassPage({ params }: { params: { code: string } }) {
  const [data, setData] = useState<ClassData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/classes/${encodeURIComponent(params.code)}`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        setData(await r.json());
      })
      .catch(() => setNotFound(true));
  }, [params.code]);

  return (
    <AppShell active="race">
      <SiteHeader
        subtitle="TAKI ACADEMY"
        right={
          <nav className="hd-links">
            <a href="/">Trang chủ</a>
            <a className="cta" href={data ? `/dang-ky?class=${data.class.id}` : "/dang-ky"}>Vào đua lớp này</a>
          </nav>
        }
      />
      <div className="wrap">
        {notFound && (
          <div className="card"><p className="mini-note">Không tìm thấy lớp này. <a href="/">← Về trang chủ</a></p></div>
        )}
        {data && (
          <>
            <div className="hero">
              <span className="tag">🏆 ĐUA TOP XÂY KÊNH</span>
              <h1>{data.class.name}</h1>
              <p>
                {data.class.students.toLocaleString("vi-VN")} học viên đã ghi danh
                {data.primary_campaign ? ` · Chiến dịch đang chạy: ${data.primary_campaign.name}` : " · Chưa có chiến dịch đang chạy"}
              </p>
              {data.primary_campaign && (
                <div className="meta">
                  <div>
                    <span>Kết thúc sau</span>
                    <Countdown endDate={data.primary_campaign.end_date} />
                  </div>
                  {data.primary_campaign.registration_deadline && (
                    <div><b>{dmy(data.primary_campaign.registration_deadline)}</b><span>hạn chốt đăng ký kênh</span></div>
                  )}
                </div>
              )}
            </div>

            {/* BXH dashboard: thống kê + podium + bảng đầy đủ (bấm hàng xem kênh) */}
            {data.primary_campaign ? (
              <LeaderboardBoard campaignId={data.primary_campaign.id} onOpenProfile={setProfileId} />
            ) : (
              <div className="card"><p className="mini-note">Lớp chưa có chiến dịch đang chạy.</p></div>
            )}

            <div className="grid g2h sec">
              <div className="card">
                {data.primary_campaign && prizeList(data.primary_campaign.prizes, data.primary_campaign.prize).length > 0 ? (
                  <>
                    <h3>🎁 Cơ cấu giải thưởng</h3>
                    {prizeList(data.primary_campaign.prizes, data.primary_campaign.prize).map((p, i) => (
                      <div className="feed-item" key={i}>
                        <div className="ic">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎖"}</div>
                        <div><b>{p.label}</b><span className="t">{p.reward}</span></div>
                      </div>
                    ))}
                  </>
                ) : (
                  <h3>🎁 Giải thưởng sẽ công bố sớm</h3>
                )}
              </div>

              <div className="card">
                <h3>📋 Chiến dịch của lớp</h3>
                {data.campaigns.map((c) => {
                  const pill = STATUS_LABEL[c.status] ?? ["pill-done", c.status];
                  return (
                    <div className="class-row" key={c.id}>
                      <div className="nm">
                        <b>{c.name}</b>
                        <span>{dmy(c.start_date)} – {dmy(c.end_date)}{c.prize ? ` · 🎁 ${c.prize}` : ""}</span>
                      </div>
                      <span className={`pill ${pill[0]}`}>{pill[1]}</span>
                    </div>
                  );
                })}
                {!data.campaigns.length && <p className="mini-note">Lớp chưa có chiến dịch nào.</p>}
                <a className="btn btn-link" style={{ marginTop: 14 }} href={`/dang-ky?class=${data.class.id}`}>
                  Đăng ký vào đường đua của lớp
                </a>
              </div>
            </div>
          </>
        )}
      </div>
      {profileId && <ProfileModal publicId={profileId} onClose={() => setProfileId(null)} />}
    </AppShell>
  );
}
