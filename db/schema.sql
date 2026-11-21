-- WillAI job store. Safe to run repeatedly (the server runs it on boot).
create table if not exists postings (
  id               text primary key,
  source           text not null,
  source_name      text not null,                 -- e.g. greenhouse:stripe, adzuna:in
  source_kind      text not null default 'aggregator',  -- ats | aggregator | willai
  company          text not null default '',
  company_category text,
  title            text not null,
  norm_title       text not null default '',
  role_family      text not null default 'other',
  seniority        text not null default 'unknown',
  employment_type  text not null default 'full_time',
  work_mode        text not null default 'unknown', -- remote | hybrid | onsite | unknown
  cities           text[] not null default '{}',
  countries        text[] not null default '{}',
  location_raw     text not null default '',
  dept             text,
  salary_min       double precision,
  salary_max       double precision,
  salary_currency  text,
  skills           text[] not null default '{}',
  tags             text[] not null default '{}',
  text             text not null default '',          -- clipped to 2,000 chars
  text_hash        text,
  url              text not null default '',
  posted_at        timestamptz,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  closed_at        timestamptz,
  status           text not null default 'active',  -- active | stale | closed
  ai               boolean not null default false,
  ai_title         boolean not null default false,
  trust_score      integer not null default 75,
  trust_flags      text[] not null default '{}',
  reports          integer not null default 0,
  owner_uid        text,                            -- WillAI employer posts only
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(text, ''), 700)), 'D')
  ) stored
);
create index if not exists postings_tsv on postings using gin (tsv);
create index if not exists postings_skills on postings using gin (skills);
create index if not exists postings_cities on postings using gin (cities);
create index if not exists postings_countries on postings using gin (countries);
create index if not exists postings_status_posted on postings (status, posted_at desc nulls last);
create index if not exists postings_family on postings (role_family, status);
create index if not exists postings_source on postings (source_name, status);
create index if not exists postings_owner on postings (owner_uid) where owner_uid is not null;
create index if not exists postings_hash on postings (text_hash) where text_hash is not null;

create table if not exists job_reports (
  job_id  text not null,
  uid     text not null,
  reason  text not null,
  note    text,
  at      timestamptz not null default now(),
  primary key (job_id, uid)
);

create table if not exists collect_runs (
  id         bigserial primary key,
  started_at timestamptz not null,
  took_ms    integer,
  total      integer,
  sources    jsonb
);
