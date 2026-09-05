-- Dữ liệu khởi tạo (chạy sau 0001_schema.sql)

insert into classes (name, code) values
  ('Minh Trí Kim Cương K12', 'MTKC-K12'),
  ('BrandUP K05', 'BRANDUP-K05'),
  ('AI Scale Up — Cohort 2', 'AISU-C2')
on conflict (code) do nothing;

-- Nền tảng quét (engine trực tiếp — cột apify_actor giữ lại vì schema cũ, giá trị 'direct')
insert into platform_configs (platform, apify_actor, input_template, is_active) values
  ('tiktok',    'direct', null, true),
  ('facebook',  'direct', null, true),
  ('youtube',   'direct', null, false),
  ('instagram', 'direct', null, false)
on conflict (platform) do nothing;

-- Chiến dịch mẫu cho lớp MTKC K12 (đang chạy)
with c as (select id from classes where code = 'MTKC-K12')
insert into campaigns (name, scope, start_date, end_date, registration_deadline, prize, prizes, weekly_quota, status)
select 'Đường đua 30 ngày K12', 'class', current_date - 5, current_date + 25, current_date + 10,
       'Top 1 nhận suất coaching 1:1 cùng Founder',
       '[{"label":"Top 1","reward":"Suất coaching 1:1 cùng Founder"},{"label":"Top 2-3","reward":"Vé tham dự buổi tổng kết trên sân khấu"},{"label":"Đủ chỉ tiêu 4 tuần","reward":"Chứng nhận hoàn thành đường đua"}]',
       5, 'running'
where not exists (select 1 from campaigns where name = 'Đường đua 30 ngày K12');

insert into campaign_classes (campaign_id, class_id)
select cp.id, cl.id from campaigns cp, classes cl
where cp.name = 'Đường đua 30 ngày K12' and cl.code = 'MTKC-K12'
on conflict do nothing;
