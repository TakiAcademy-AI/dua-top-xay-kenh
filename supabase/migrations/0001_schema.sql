-- ĐUA TOP XÂY KÊNH — Schema V1 (chạy trong Supabase SQL Editor)
create extension if not exists pgcrypto;

-- Lớp học
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Học viên
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,               -- TK-26-0189
  full_name text not null,
  phone text unique not null,
  class_id uuid references classes(id),
  status text not null default 'active' check (status in ('active','locked')),
  created_at timestamptz not null default now()
);

-- Kênh
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  platform text not null check (platform in ('tiktok','youtube','facebook','instagram')),
  url text not null,
  username text not null,
  status text not null default 'pending' check (status in ('pending','verified','flagged','removed')),
  baseline_followers int,
  baseline_views bigint,
  verified_at timestamptz,
  verified_by text,                             -- 'system' | 'admin'
  created_at timestamptz not null default now(),
  unique (platform, username)
);

-- Chiến dịch
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'class' check (scope in ('class','global','industry')),
  start_date date not null,
  end_date date not null,
  registration_deadline date,
  prize text,
  weights jsonb not null default '{"follower":10,"per_1000_views":5,"new_video":20,"engagement":2,"weekly_bonus":100}',
  weekly_quota int not null default 0,          -- số video tối thiểu / tuần
  normalize_by_baseline boolean not null default true,
  status text not null default 'open' check (status in ('draft','open','running','paused','finished')),
  created_by text,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

create table if not exists campaign_classes (
  campaign_id uuid references campaigns(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  primary key (campaign_id, class_id)
);

create table if not exists campaign_participants (
  campaign_id uuid references campaigns(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  joined_at timestamptz not null default now(),
  total_score numeric not null default 0,
  current_rank int,
  prev_rank int,
  rank_updated_on date,                         -- ngày cuối cùng cập nhật hạng (để prev_rank đúng khi chạy lại job)
  primary key (campaign_id, student_id)
);

-- Ảnh chụp số liệu kênh mỗi ngày
create table if not exists channel_snapshots (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  snapshot_date date not null,
  followers int,
  total_views bigint,
  videos_count int,
  engagement bigint,
  raw jsonb,
  scrape_status text not null default 'ok' check (scrape_status in ('ok','failed')),
  created_at timestamptz not null default now(),
  unique (channel_id, snapshot_date)
);

-- Nhật ký cộng điểm (nguồn sự thật duy nhất về điểm)
create table if not exists score_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  entry_date date not null,
  metric text not null check (metric in ('follower','views','new_video','engagement','weekly_bonus','manual_adjust')),
  raw_value numeric,
  weight numeric,
  points numeric not null,
  note text,
  created_by text,                              -- khác null = điều chỉnh tay
  created_at timestamptz not null default now()
);
create index if not exists score_entries_student_idx on score_entries(campaign_id, student_id, entry_date);
create index if not exists score_entries_date_idx on score_entries(campaign_id, entry_date);

-- Nhật ký hệ thống
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Cấu hình Apify Actor theo nền tảng
create table if not exists platform_configs (
  platform text primary key,
  apify_actor text not null,
  input_template jsonb,
  is_active boolean not null default true
);

-- Mã OTP đăng nhập
create table if not exists otp_codes (
  phone text primary key,
  code text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

-- Nhật ký run Apify (theo dõi chi phí)
create table if not exists scrape_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text,
  platform text,
  actor text,
  status text not null default 'started',       -- started | succeeded | failed
  channels_count int,
  cost_usd numeric,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Bộ đếm sinh ID cá nhân TK-YY-XXXX
create table if not exists id_counters (year int primary key, last int not null default 0);

create or replace function next_public_id() returns text
language plpgsql as $$
declare
  y int := (extract(year from now() at time zone 'Asia/Ho_Chi_Minh')::int % 100);
  n int;
begin
  insert into id_counters (year, last) values (y, 1)
  on conflict (year) do update set last = id_counters.last + 1
  returning last into n;
  return 'TK-' || lpad(y::text, 2, '0') || '-' || lpad(n::text, 4, '0');
end $$;

-- Row Level Security: khóa toàn bộ với anon key.
-- Mọi truy cập dữ liệu đi qua API routes của app (service role) — client không bao giờ chạm thẳng vào DB.
alter table classes enable row level security;
alter table students enable row level security;
alter table channels enable row level security;
alter table campaigns enable row level security;
alter table campaign_classes enable row level security;
alter table campaign_participants enable row level security;
alter table channel_snapshots enable row level security;
alter table score_entries enable row level security;
alter table audit_logs enable row level security;
alter table platform_configs enable row level security;
alter table otp_codes enable row level security;
alter table scrape_runs enable row level security;
alter table id_counters enable row level security;
