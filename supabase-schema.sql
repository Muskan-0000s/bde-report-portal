-- Run this once in your Supabase project's SQL editor (Supabase dashboard > SQL Editor > New query).

create table if not exists bde_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  bde_name text not null default '',
  total_calls integer not null default 0,
  positive_response integer not null default 0,
  meetings_scheduled integer not null default 0,
  physical_meets text not null default '',
  physical_meets_remarks text not null default '',
  absent boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bde_reports_date on bde_reports (report_date);

-- Row Level Security: the app talks to Supabase only through the Next.js API routes
-- using the service role key (server-side, bypasses RLS), so the table can stay locked
-- down from any direct/public access. No policies are required for the app to work.
alter table bde_reports enable row level security;
