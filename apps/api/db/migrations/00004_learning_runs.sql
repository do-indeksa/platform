-- +goose Up
create table runs (
    id uuid primary key,
    user_id uuid not null references users (id) on delete cascade,
    kind text not null check (kind in ('practice', 'diagnostic', 'simulation')),
    status text not null default 'active' check (status in ('active', 'submitted', 'abandoned')),
    blueprint_version text not null check (char_length(blueprint_version) between 1 and 64),
    content_revision text not null check (char_length(content_revision) between 1 and 128),
    started_at timestamptz not null,
    deadline_at timestamptz,
    submitted_at timestamptz,
    duration_ms bigint check (duration_ms >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id),
    check (deadline_at is null or deadline_at >= started_at),
    check ((status = 'submitted') = (submitted_at is not null)),
    check (submitted_at is null or submitted_at >= started_at)
);

create index runs_user_id_started_at_idx on runs (user_id, started_at desc, id);

create table run_items (
    id uuid primary key,
    run_id uuid not null,
    user_id uuid not null,
    task_id text not null check (char_length(task_id) between 1 and 64 and task_id ~ '^[a-z0-9-]+$'),
    ordinal smallint not null check (ordinal between 1 and 100),
    exam_position smallint not null check (exam_position between 1 and 10),
    topic text not null check (char_length(topic) between 1 and 64 and topic ~ '^[a-z0-9-]+$'),
    max_points smallint check (max_points between 0 and 60),
    task_revision text not null check (char_length(task_revision) between 1 and 128),
    created_at timestamptz not null default now(),
    unique (run_id, ordinal),
    unique (run_id, task_id),
    unique (id, user_id),
    foreign key (run_id, user_id) references runs (id, user_id) on delete cascade
);

alter table attempts
add column public_id uuid not null default gen_random_uuid(),
add column run_item_id uuid,
add column started_at timestamptz,
add column submitted_at timestamptz,
add column active_duration_ms bigint,
add column answer text,
add column outcome text,
add column grading_kind text,
add column earned_points smallint,
add column max_points smallint,
add column task_revision text;

update attempts
set started_at = created_at,
    submitted_at = created_at,
    outcome = case when correct then 'correct' else 'incorrect' end,
    grading_kind = 'auto';

alter table attempts
add constraint attempts_public_id_key unique (public_id),
add constraint attempts_run_item_user_fkey foreign key (run_item_id, user_id) references run_items (id, user_id),
add constraint attempts_active_duration_check check (active_duration_ms is null or active_duration_ms >= 0),
add constraint attempts_answer_size_check check (answer is null or char_length(answer) <= 8192),
add constraint attempts_outcome_check check (outcome is null or outcome in ('correct', 'incorrect', 'partial', 'skipped', 'ungraded')),
add constraint attempts_outcome_projection_check check (outcome is null or correct = (outcome = 'correct')),
add constraint attempts_grading_kind_check check (grading_kind is null or grading_kind in ('auto', 'rubric_self', 'ai_assisted', 'human')),
add constraint attempts_points_check check (
    (earned_points is null or earned_points between 0 and 60)
    and (max_points is null or max_points between 0 and 60)
    and (earned_points is null or max_points is null or earned_points <= max_points)
),
add constraint attempts_timestamps_check check (
    started_at is null or submitted_at is null or submitted_at >= started_at
),
add constraint attempts_task_revision_check check (task_revision is null or char_length(task_revision) between 1 and 128);

create index attempts_user_id_submitted_at_idx on attempts (user_id, submitted_at desc, id);
create index attempts_run_item_id_idx on attempts (run_item_id, submitted_at, id) where run_item_id is not null;

-- +goose Down
drop index attempts_run_item_id_idx;
drop index attempts_user_id_submitted_at_idx;

alter table attempts
drop constraint attempts_task_revision_check,
drop constraint attempts_timestamps_check,
drop constraint attempts_points_check,
drop constraint attempts_grading_kind_check,
drop constraint attempts_outcome_projection_check,
drop constraint attempts_outcome_check,
drop constraint attempts_answer_size_check,
drop constraint attempts_active_duration_check,
drop constraint attempts_run_item_user_fkey,
drop constraint attempts_public_id_key,
drop column task_revision,
drop column max_points,
drop column earned_points,
drop column grading_kind,
drop column outcome,
drop column answer,
drop column active_duration_ms,
drop column submitted_at,
drop column started_at,
drop column run_item_id,
drop column public_id;

drop table run_items;
drop table runs;
