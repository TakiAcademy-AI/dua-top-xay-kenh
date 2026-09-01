"use client";

import { useCallback, useEffect, useState } from "react";
import { Lane, LBRow, METRIC_LABEL, SiteHeader, useToast } from "@/components/ui";

type Campaign = {
  id: string; name: string; scope: string; class_names: string[];
  start_date: string; end_date: string; registration_deadline: string | null;
  prize: string | null; weights: Record<string, number>; weekly_quota: number;
  status: string; participants: number;
};
type StudentRow = {
  id: string; public_id: string; full_name: string; phone: string; status: string;
  class_name: string | null; platforms: string[]; verified: number; total_channels: number; best_score: number;
};

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const STATUS_PILL: Record<string, [string, string]> = {
  running: ["pill-live", "Đang chạy"],
  open: ["pill-soon", "Sắp mở"],
  draft: ["pill-soon", "Nháp"],
  paused: ["pill-warn", "Tạm dừng"],
  finished: ["pill-done", "Đã kết thúc"],
};

export default function AdminPage() {
  const { toast, toastNode } = useToast();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"camp" | "new" | "students" | "bxh">("camp");

  const [stats, setStats] = useState({ running: 0, students: 0, channels: 0 });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [q, setQ] = useState("");
  const [lbCampId, setLbCampId] = useState("");
  const [lbRows, setLbRows] = useState<LBRow[]>([]);
  const [profile, setProfile] = useState<any | null>(null);

  // Form tạo chiến dịch
  const [form, setForm] = useState({
    name: "", scope: "class", class_ids: [] as string[],
    start_date: "", end_date: "", registration_deadline: "", prize: "",
    weekly_quota: "5",
    weights: { follower: "10", per_1000_views: "5", new_video: "20", engagement: "2", weekly_bonus: "100" },
  });

  const loadCampaigns = useCallback(async () => {
    const r = await fetch("/api/admin/campaigns");
    if (r.status === 401) { setAuthed(false); return; }
    if (!r.ok) {
      setAuthed(false);
      toast("Không kết nối được database — kiểm tra .env.local và chạy migration");
      return;
    }
    const d = await r.json();
    setAuthed(true);
    setStats(d.stats);
    setCampaigns(d.campaigns);
    if (!lbCampId && d.campaigns.length) setLbCampId(d.campaigns[0].id);
  }, [lbCampId]);

  useEffect(() => {
    loadCampaigns();
    fetch("/api/classes").then((r) => r.json()).then((d) => setClasses(d.classes ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStudents = useCallback(async (query: string) => {
    const r = await fetch(`/api/admin/students?q=${encodeURIComponent(query)}`);
    if (r.ok) setStudents((await r.json()).students);
  }, []);

  useEffect(() => { if (authed && tab === "students") loadStudents(q); }, [authed, tab, q, loadStudents]);
  useEffect(() => {
    if (authed && tab === "bxh" && lbCampId) {
      fetch(`/api/leaderboard?campaign_id=${lbCampId}`).then((r) => r.json()).then((d) => setLbRows(d.rows ?? []));
    }
  }, [authed, tab, lbCampId]);

  async function login() {
    const r = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) { setAuthed(true); loadCampaigns(); }
    else toast((await r.json()).error ?? "Sai mật khẩu");
  }

  async function createCampaign() {
    const body = {
      name: form.name,
      scope: form.scope,
      class_ids: form.class_ids,
      start_date: form.start_date,
      end_date: form.end_date,
      registration_deadline: form.registration_deadline || null,
      prize: form.prize,
      weekly_quota: Number(form.weekly_quota || 0),
      weights: Object.fromEntries(Object.entries(form.weights).map(([k, v]) => [k, Number(v)])),
    };
    const r = await fetch("/api/admin/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      toast(`Đã tạo chiến dịch: ${body.name}`);
      setTab("camp");
      loadCampaigns();
    } else toast(d.error ?? "Không tạo được chiến dịch");
  }

  async function campaignAction(c: Campaign, action: "pause" | "resume" | "finish") {
    const labels = { pause: "TẠM DỪNG", resume: "chạy tiếp", finish: "KẾT THÚC SỚM" };
    if (action !== "resume" && !confirm(`Xác nhận ${labels[action]} chiến dịch "${c.name}"?`)) return;
    if (action === "finish" && !confirm(`Chắc chắn kết thúc "${c.name}"? Hành động này không hoàn tác được.`)) return;
    const r = await fetch(`/api/admin/campaigns/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const d = await r.json();
    if (r.ok) { toast("Đã cập nhật trạng thái"); loadCampaigns(); }
    else toast(d.error ?? "Không cập nhật được");
  }

  async function openProfile(id: string) {
    const r = await fetch(`/api/admin/students/${id}`);
    if (r.ok) setProfile(await r.json());
  }

  async function verifyChannel(chId: string) {
    const r = await fetch(`/api/admin/channels/${chId}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (r.ok) { toast("Đã xác minh kênh"); openProfile(profile.student.id); loadStudents(q); }
    else toast((await r.json()).error ?? "Lỗi");
  }

  async function toggleLock() {
    const lock = profile.student.status !== "locked";
    const reason = lock ? prompt("Lý do khóa học viên (bắt buộc):") : null;
    if (lock && !reason) return;
    const r = await fetch(`/api/admin/students/${profile.student.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: lock ? "locked" : "active", reason }),
    });
    if (r.ok) { toast(lock ? "Đã khóa học viên" : "Đã mở khóa"); openProfile(profile.student.id); }
  }

  async function adjustScore(campaignId: string) {
    const points = Number(prompt("Số điểm điều chỉnh (âm để trừ):") ?? "");
    if (!Number.isFinite(points) || points === 0) return;
    const note = prompt("Lý do điều chỉnh (bắt buộc):")?.trim();
    if (!note) { toast("Bắt buộc nhập lý do"); return; }
    const r = await fetch("/api/admin/scores/adjust", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, student_id: profile.student.id, points, note }),
    });
    if (r.ok) { toast("Đã điều chỉnh điểm"); openProfile(profile.student.id); }
    else toast((await r.json()).error ?? "Lỗi");
  }

  if (authed === false) {
    return (
      <>
        <SiteHeader subtitle="BẢNG ĐIỀU KHIỂN ADMIN" right={<span>Admin · TAKI ACADEMY</span>} />
        <div className="wrap" style={{ maxWidth: 420 }}>
          <div className="card">
            <h3>🔐 Đăng nhập admin</h3>
            <div className="field">
              <label>Mật khẩu</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()} />
            </div>
            <button className="btn" onClick={login}>Đăng nhập</button>
          </div>
        </div>
        {toastNode}
      </>
    );
  }
  if (authed === null) return <><SiteHeader subtitle="BẢNG ĐIỀU KHIỂN ADMIN" right={<span />} /><div className="wrap"><p className="mini-note">Đang tải…</p></div></>;

  const maxLb = lbRows[0]?.total_score ?? 0;

  return (
    <>
      <SiteHeader subtitle="BẢNG ĐIỀU KHIỂN ADMIN" right={<span>Admin · TAKI ACADEMY</span>} />
      <div className="wrap">
        <div className="tabs">
          <button className={tab === "camp" ? "on" : ""} onClick={() => { setTab("camp"); loadCampaigns(); }}>Chiến dịch</button>
          <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>+ Tạo chiến dịch</button>
          <button className={tab === "students" ? "on" : ""} onClick={() => setTab("students")}>Học viên</button>
          <button className={tab === "bxh" ? "on" : ""} onClick={() => setTab("bxh")}>Bảng xếp hạng</button>
        </div>

        {tab === "camp" && (
          <div>
            <div className="grid grid-3" style={{ marginBottom: 18 }}>
              <div className="stat"><b>{stats.running}</b><span>Chiến dịch đang chạy</span></div>
              <div className="stat"><b>{fmt(stats.students)}</b><span>Học viên tham gia</span></div>
              <div className="stat"><b>{fmt(stats.channels)}</b><span>Kênh đang theo dõi</span></div>
            </div>
            <div className="card">
              <h3>📋 Tất cả chiến dịch</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Chiến dịch</th><th>Phạm vi</th><th>Thời gian</th><th>Học viên</th><th>Trạng thái</th><th></th></tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const pill = STATUS_PILL[c.status] ?? ["pill-done", c.status];
                      return (
                        <tr key={c.id}>
                          <td><b>{c.name}</b>{c.prize ? <div className="mini-note">🎁 {c.prize}</div> : null}</td>
                          <td>{c.scope === "global" ? "Toàn hệ thống" : c.class_names.join(", ") || "Theo lớp"}</td>
                          <td>{dmy(c.start_date)} – {dmy(c.end_date)}</td>
                          <td>{c.participants || "—"}</td>
                          <td><span className={`pill ${pill[0]}`}>{pill[1]}</span></td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {c.status === "running" && (
                              <button className="btn-ghost btn-sm" onClick={() => campaignAction(c, "pause")}>Tạm dừng</button>
                            )}{" "}
                            {c.status === "paused" && (
                              <button className="btn-ghost btn-sm" onClick={() => campaignAction(c, "resume")}>Chạy tiếp</button>
                            )}{" "}
                            {["running", "paused", "open"].includes(c.status) && (
                              <button className="btn-ghost btn-sm btn-danger" onClick={() => campaignAction(c, "finish")}>Kết thúc</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!campaigns.length && <tr><td colSpan={6}>Chưa có chiến dịch nào.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "new" && (
          <div className="two-col">
            <div className="card">
              <h3>🚀 Thông tin chiến dịch</h3>
              <div className="field"><label>Tên chiến dịch</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Đường đua 30 ngày K12" /></div>
              <div className="field"><label>Phạm vi đua</label>
                <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  <option value="class">Theo lớp học</option>
                  <option value="global">Toàn hệ thống (liên lớp)</option>
                  <option value="industry">Theo nhóm ngành hàng</option>
                </select></div>
              {form.scope === "class" && (
                <div className="field"><label>Chọn lớp áp dụng (giữ Cmd/Ctrl để chọn nhiều)</label>
                  <select multiple size={3} value={form.class_ids}
                    onChange={(e) => setForm({ ...form, class_ids: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              )}
              <div className="two-col">
                <div className="field"><label>Ngày bắt đầu</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div className="field"><label>Ngày kết thúc</label>
                  <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div className="field"><label>Hạn chốt đăng ký kênh</label>
                <input type="date" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} /></div>
              <div className="field"><label>Giải thưởng (hiện trên trang đua)</label>
                <input value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="Ví dụ: Top 1 nhận suất coaching 1:1" /></div>
            </div>

            <div className="card">
              <h3>⚖️ Công thức tính điểm</h3>
              <p className="mini-note" style={{ marginBottom: 12 }}>
                Đặt trọng số cho từng chỉ số. Điểm = tổng các chỉ số nhân trọng số, chuẩn hóa theo quy mô kênh
                lúc xuất phát để công bằng giữa kênh mới và kênh lớn. Công thức đóng băng khi chiến dịch bắt đầu.
              </p>
              {([
                ["follower", "Follower tăng thêm"],
                ["per_1000_views", "Mỗi 1.000 lượt xem"],
                ["new_video", "Mỗi video đăng mới"],
                ["engagement", "Tương tác (like + share + bình luận)"],
                ["weekly_bonus", "Điểm chuyên cần (đăng đủ chỉ tiêu tuần)"],
              ] as const).map(([key, label]) => (
                <div className="w-row" key={key}>
                  <span>{label}</span>
                  <input type="number" min={0} value={form.weights[key]}
                    onChange={(e) => setForm({ ...form, weights: { ...form.weights, [key]: e.target.value } })} />
                </div>
              ))}
              <div className="field" style={{ marginTop: 14 }}>
                <label>Chỉ tiêu video tối thiểu mỗi tuần</label>
                <input type="number" min={0} value={form.weekly_quota}
                  onChange={(e) => setForm({ ...form, weekly_quota: e.target.value })} placeholder="Ví dụ: 5" />
              </div>
              <button className="btn" onClick={createCampaign}>Tạo chiến dịch và mở đăng ký</button>
            </div>
          </div>
        )}

        {tab === "students" && (
          <div className="card">
            <h3>
              👥 Học viên đã đăng ký
              <input placeholder="Tìm theo tên, ID, SĐT…" style={{ maxWidth: 240, marginLeft: "auto" }}
                value={q} onChange={(e) => setQ(e.target.value)} />
            </h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>ID</th><th>Học viên</th><th>Lớp</th><th>Kênh</th><th>Xác minh</th><th>Điểm</th><th></th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} style={s.status === "locked" ? { opacity: 0.55 } : undefined}>
                      <td><b>{s.public_id}</b></td>
                      <td>{s.full_name}{s.status === "locked" ? " 🔒" : ""}</td>
                      <td>{s.class_name ?? "—"}</td>
                      <td>{s.platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(", ") || "—"}</td>
                      <td>
                        <span className={`pill ${s.verified === s.total_channels && s.total_channels > 0 ? "pill-live" : "pill-soon"}`}>
                          {s.verified}/{s.total_channels}
                        </span>
                      </td>
                      <td><b>{s.best_score ? fmt(s.best_score) : "—"}</b></td>
                      <td><button className="btn-ghost btn-sm" onClick={() => openProfile(s.id)}>Hồ sơ</button></td>
                    </tr>
                  ))}
                  {!students.length && <tr><td colSpan={7}>Không có học viên nào khớp.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "bxh" && (
          <div className="card">
            <h3>
              🏆 Bảng xếp hạng
              <select style={{ maxWidth: 280, marginLeft: "auto" }} value={lbCampId} onChange={(e) => setLbCampId(e.target.value)}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <a className="btn-ghost btn-sm" href={`/api/admin/export/leaderboard?campaign_id=${lbCampId}`} style={{ textDecoration: "none" }}>
                Xuất Excel
              </a>
            </h3>
            <div>
              {lbRows.map((r) => <Lane key={r.student_id} row={r} max={maxLb} />)}
              {!lbRows.length && <p className="mini-note">Chưa có dữ liệu xếp hạng cho chiến dịch này.</p>}
            </div>
          </div>
        )}
      </div>

      {profile && (
        <div className="modal-bg" onClick={() => setProfile(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 800, color: "var(--navy)", marginBottom: 4 }}>
              {profile.student.full_name} · <span style={{ color: "var(--orange)" }}>{profile.student.public_id}</span>
            </h3>
            <p className="mini-note" style={{ marginBottom: 14 }}>
              SĐT: {profile.student.phone} · Lớp: {profile.student.classes?.name ?? "—"} ·{" "}
              {profile.student.status === "locked" ? "🔒 Đang bị khóa" : "Đang hoạt động"}
              <button className="btn-ghost btn-sm btn-danger" style={{ marginLeft: 10 }} onClick={toggleLock}>
                {profile.student.status === "locked" ? "Mở khóa" : "Khóa học viên"}
              </button>
            </p>

            <h4 style={{ fontWeight: 800, fontSize: 13, color: "var(--navy)", margin: "10px 0 8px" }}>Kênh</h4>
            {profile.channels.map((c: any) => (
              <div className="chan" key={c.id}>
                <div className="u">
                  <b>{c.platform} · @{c.username}</b>
                  <span>
                    Baseline: {c.baseline_followers != null ? fmt(c.baseline_followers) : "—"} fl ·
                    Mới nhất: {c.latest?.followers != null ? fmt(c.latest.followers) : "chưa quét"}
                  </span>
                </div>
                {c.status === "verified" ? <span className="st st-ok">Đã xác minh</span>
                  : c.status === "flagged" ? <span className="st st-flag">Gắn cờ</span>
                  : <span className="st st-wait">Chờ xác minh</span>}
                {c.status !== "verified" && (
                  <button className="btn-ghost btn-sm" onClick={() => verifyChannel(c.id)}>Xác minh tay</button>
                )}
              </div>
            ))}

            <h4 style={{ fontWeight: 800, fontSize: 13, color: "var(--navy)", margin: "14px 0 8px" }}>Chiến dịch</h4>
            {profile.participations.map((p: any) => (
              <p key={p.campaign_id} style={{ fontSize: 13, marginBottom: 6 }}>
                {p.campaign_name}: <b>{fmt(p.total_score)} điểm</b> · Hạng {p.rank ?? "—"}
                <button className="btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => adjustScore(p.campaign_id)}>
                  Điều chỉnh điểm
                </button>
              </p>
            ))}

            <h4 style={{ fontWeight: 800, fontSize: 13, color: "var(--navy)", margin: "14px 0 8px" }}>Lịch sử điểm gần nhất</h4>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Ngày</th><th>Chiến dịch</th><th>Chỉ số</th><th>Điểm</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {profile.score_entries.slice(0, 30).map((e: any, i: number) => (
                    <tr key={i}>
                      <td>{dmy(e.entry_date)}</td>
                      <td>{e.campaign_name}</td>
                      <td>{METRIC_LABEL[e.metric] ?? e.metric}</td>
                      <td><b>{e.points.toLocaleString("vi-VN")}</b></td>
                      <td>{e.note ?? "—"}</td>
                    </tr>
                  ))}
                  {!profile.score_entries.length && <tr><td colSpan={5}>Chưa có điểm.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {toastNode}
    </>
  );
}
