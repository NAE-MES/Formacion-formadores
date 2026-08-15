create table if not exists candidates (
  candidate_id text primary key,
  first_name text not null default '',
  second_name text not null default '',
  first_surname text not null default '',
  second_surname text not null default '',
  identification_number text not null default '',
  email text not null default '',
  province text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists submissions (
  submission_id text primary key,
  candidate_id text references candidates(candidate_id),
  source_channel text not null,
  source_reference text not null default '',
  received_at timestamptz not null,
  normalization_status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists submission_raws (
  submission_raw_id text primary key,
  submission_id text not null references submissions(submission_id),
  source_channel text not null,
  raw_payload jsonb not null,
  raw_hash text not null,
  received_at timestamptz not null
);

create table if not exists candidate_responses (
  candidate_response_id text primary key,
  candidate_id text not null references candidates(candidate_id),
  submission_id text not null references submissions(submission_id),
  field_code text not null,
  value jsonb not null
);

create table if not exists documents (
  document_id text primary key,
  candidate_id text not null references candidates(candidate_id),
  document_type text not null,
  source_channel text not null,
  original_name text not null default '',
  storage_reference text not null default '',
  received_at timestamptz not null,
  status text not null,
  reviewed_at timestamptz,
  reviewed_by text not null default ''
);

create table if not exists normalization_issues (
  normalization_issue_id text primary key,
  submission_id text not null,
  candidate_id text not null default '',
  field_code text not null default '',
  code text not null,
  severity text not null,
  message text not null,
  created_at timestamptz not null,
  review_status text not null default 'OPEN',
  review_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by text not null default ''
);

create table if not exists audit_events (
  audit_event_id text primary key,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  occurred_at timestamptz not null,
  source_channel text not null default '',
  actor text not null,
  previous_value jsonb,
  new_value jsonb,
  reason text not null default ''
);

create table if not exists admin_users (
  admin_user_id text primary key,
  username text not null unique,
  password_hash text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists admin_sessions (
  admin_session_id text primary key,
  admin_user_id text not null references admin_users(admin_user_id),
  session_token_hash text not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists idx_submissions_candidate_id on submissions(candidate_id);
create index if not exists idx_candidate_responses_candidate_id on candidate_responses(candidate_id);
create index if not exists idx_documents_candidate_id on documents(candidate_id);
create index if not exists idx_normalization_issues_submission_id on normalization_issues(submission_id);
create index if not exists idx_admin_sessions_token_hash on admin_sessions(session_token_hash);
create index if not exists idx_admin_sessions_user_id on admin_sessions(admin_user_id);

alter table documents add column if not exists reviewed_at timestamptz;
alter table documents add column if not exists reviewed_by text not null default '';
alter table normalization_issues add column if not exists review_status text not null default 'OPEN';
alter table normalization_issues add column if not exists review_note text not null default '';
alter table normalization_issues add column if not exists reviewed_at timestamptz;
alter table normalization_issues add column if not exists reviewed_by text not null default '';
