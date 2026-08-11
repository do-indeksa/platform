-- name: InsertAttempts :copyfrom
insert into attempts (
    user_id,
    task_id,
    slot,
    correct,
    source,
    help_level,
    created_at,
    started_at,
    submitted_at,
    outcome,
    grading_kind
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);

-- name: ListAttempts :many
select task_id, slot, correct, source, help_level, created_at
from (
    select id, task_id, slot, correct, source, help_level, created_at
    from attempts
    where user_id = $1
      and (outcome is null or outcome in ('correct', 'incorrect'))
    order by created_at desc, id desc
    limit 1000
) recent
order by created_at, id;

-- name: ListAttemptJournal :many
with recent_attempt_ids as (
    select id
    from attempts
    where attempts.user_id = sqlc.arg(user_id)
    order by coalesce(submitted_at, created_at) desc, id desc
    limit sqlc.arg(max_attempts)
)
select a.*
from attempts a
join recent_attempt_ids recent on recent.id = a.id
order by coalesce(a.submitted_at, a.created_at), a.id;

-- name: CreateRun :one
insert into runs (
    id,
    user_id,
    kind,
    blueprint_version,
    content_revision,
    started_at,
    deadline_at
)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (id) do nothing
returning *;

-- name: GetRun :one
select *
from runs
where id = $1 and user_id = $2;

-- name: GetRunForUpdate :one
select *
from runs
where id = $1 and user_id = $2
for update;

-- name: ListRuns :many
select *
from runs
where user_id = $1
order by started_at desc, id
limit $2;

-- name: ListCompletedSimulationRuns :many
select *
from runs
where user_id = $1
  and kind = 'simulation'
  and status = 'submitted'
order by submitted_at desc, id
limit $2;

-- name: CreateRunItem :one
insert into run_items (
    id,
    run_id,
    user_id,
    task_id,
    ordinal,
    exam_position,
    topic,
    max_points,
    task_revision
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: ListRunItems :many
select *
from run_items
where run_id = $1 and user_id = $2
order by ordinal;

-- name: ListRunItemsByRunIDs :many
select *
from run_items
where user_id = sqlc.arg(user_id)
  and run_id = any(sqlc.arg(run_ids)::uuid[])
order by run_id, ordinal;

-- name: GetRunItemTarget :one
select
    i.id,
    i.run_id,
    i.task_id,
    i.exam_position,
    i.max_points as item_max_points,
    i.task_revision,
    r.kind as run_kind,
    r.status as run_status
from run_items i
join runs r on r.id = i.run_id and r.user_id = i.user_id
where i.id = $1 and i.user_id = $2
for share of r;

-- name: CreateAttempt :one
insert into attempts (
    public_id,
    user_id,
    run_item_id,
    task_id,
    slot,
    correct,
    source,
    help_level,
    created_at,
    started_at,
    submitted_at,
    active_duration_ms,
    answer,
    outcome,
    grading_kind,
    earned_points,
    max_points,
    task_revision
)
values (
    $1, $2, $3, $4, $5, $6, $7, $8, $9,
    $10, $11, $12, $13, $14, $15, $16, $17, $18
)
on conflict (public_id) do nothing
returning *;

-- name: GetAttempt :one
select *
from attempts
where public_id = $1 and user_id = $2;

-- name: ListRunAttempts :many
with ranked_attempt_ids as (
    select
        a.id,
        row_number() over (
            partition by a.run_item_id
            order by coalesce(a.submitted_at, a.created_at) desc, a.id desc
        ) as attempt_rank
    from attempts a
    join run_items i on i.id = a.run_item_id and i.user_id = a.user_id
    where i.run_id = sqlc.arg(run_id) and a.user_id = sqlc.arg(user_id)
)
select a.*
from attempts a
join ranked_attempt_ids recent on recent.id = a.id
where recent.attempt_rank <= sqlc.arg(max_attempts)::integer
order by coalesce(a.submitted_at, a.created_at), a.id;

-- name: ListLatestRunAttemptsByRunIDs :many
with ranked_attempt_ids as (
    select
        a.id,
        row_number() over (
            partition by a.run_item_id
            order by coalesce(a.submitted_at, a.created_at) desc, a.id desc
        ) as attempt_rank
    from attempts a
    join run_items i on i.id = a.run_item_id and i.user_id = a.user_id
    where i.run_id = any(sqlc.arg(run_ids)::uuid[])
      and a.user_id = sqlc.arg(user_id)
)
select a.*
from attempts a
join ranked_attempt_ids latest on latest.id = a.id
where latest.attempt_rank = 1
order by coalesce(a.submitted_at, a.created_at), a.id;

-- name: SubmitRun :one
update runs
set status = 'submitted',
    submitted_at = $3,
    duration_ms = $4,
    updated_at = now()
where id = $1 and user_id = $2 and status = 'active'
returning *;
