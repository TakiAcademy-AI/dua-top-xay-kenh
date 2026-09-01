"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ==== Toast ==== */
export function useToast() {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2800);
  }, []);
  const node = <div className={`toast${show ? " show" : ""}`}>{msg}</div>;
  return { toast, toastNode: node };
}

/* ==== Header ==== */
export function SiteHeader({ subtitle, right }: { subtitle: string; right?: React.ReactNode }) {
  return (
    <header className="site-header">
      <div className="logo">
        <div className="flag">🏁</div>
        <div>
          ĐUA TOP XÂY KÊNH<small>{subtitle}</small>
        </div>
      </div>
      <div className="hd-user">{right}</div>
    </header>
  );
}

/* ==== Đồng hồ đếm ngược realtime ==== */
export function Countdown({ endDate }: { endDate: string }) {
  const [left, setLeft] = useState<{ d: number; h: number; m: number } | null>(null);
  useEffect(() => {
    const target = new Date(`${endDate}T23:59:59+07:00`).getTime();
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      setLeft({
        d: Math.floor(ms / 86_400_000),
        h: Math.floor((ms % 86_400_000) / 3_600_000),
        m: Math.floor((ms % 3_600_000) / 60_000),
      });
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [endDate]);
  if (!left) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="countdown">
      <div><b>{pad(left.d)}</b><span>ngày</span></div>
      <div><b>{pad(left.h)}</b><span>giờ</span></div>
      <div><b>{pad(left.m)}</b><span>phút</span></div>
    </div>
  );
}

/* ==== Bảng xếp hạng ==== */
export type LBRow = {
  student_id: string;
  rank: number | null;
  prev_rank: number | null;
  name: string;
  public_id: string;
  total_score: number;
};

export function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((t) => t[0]).slice(-2).join("").toUpperCase();
}

export function deltaOf(row: LBRow): { text: string; cls: string } {
  if (row.prev_rank == null || row.rank == null || row.prev_rank === row.rank) return { text: "—", cls: "" };
  const d = row.prev_rank - row.rank;
  return d > 0 ? { text: `▲ ${d}`, cls: "up" } : { text: `▼ ${-d}`, cls: "down" };
}

export function Lane({ row, max, me }: { row: LBRow; max: number; me?: boolean }) {
  const w = max > 0 ? Math.max(2, Math.round((row.total_score / max) * 100)) : 2;
  const d = deltaOf(row);
  return (
    <div className={`lane${me ? " me" : ""}`}>
      <div className="rk">{row.rank ?? "—"}</div>
      <div className="ava" style={me ? { background: "var(--orange)" } : undefined}>
        {me ? "BẠN" : initials(row.name)}
      </div>
      <div className="info">
        <div className="nm">
          {row.name}
          <span className="id-chip">{row.public_id}</span>
          <span className={`delta ${d.cls}`}>{d.text}</span>
        </div>
        <div className="track"><i style={{ width: `${w}%` }} /></div>
      </div>
      <div className="pts">
        {Math.round(row.total_score).toLocaleString("vi-VN")}
        <span>điểm</span>
      </div>
    </div>
  );
}

export function Podium({ rows }: { rows: LBRow[] }) {
  const [r1, r2, r3] = rows;
  if (!r1) return null;
  const slot = (r: LBRow | undefined, cls: string, label: string) =>
    r ? (
      <div className={`p ${cls}`}>
        <div className="ava">{initials(r.name)}</div>
        <div className="box">
          <div className="rank-num">{label}</div>
          <div className="name">{r.name}</div>
          <div className="pts">{Math.round(r.total_score).toLocaleString("vi-VN")} đ</div>
        </div>
      </div>
    ) : <div className="p" />;
  return (
    <div className="podium">
      {slot(r2, "p2", "HẠNG 2")}
      {slot(r1, "p1", "HẠNG 1")}
      {slot(r3, "p3", "HẠNG 3")}
    </div>
  );
}

export const PF_ICON: Record<string, { cls: string; icon: string; label: string }> = {
  tiktok: { cls: "pf-tiktok", icon: "♪", label: "TikTok" },
  youtube: { cls: "pf-youtube", icon: "▶", label: "YouTube" },
  facebook: { cls: "pf-facebook", icon: "f", label: "Facebook" },
  instagram: { cls: "pf-instagram", icon: "📷", label: "Instagram" },
};

export const METRIC_LABEL: Record<string, string> = {
  follower: "Follower tăng",
  views: "Lượt xem",
  new_video: "Video mới",
  engagement: "Tương tác",
  weekly_bonus: "Thưởng chuyên cần",
  manual_adjust: "Điều chỉnh tay",
};
