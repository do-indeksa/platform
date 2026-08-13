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
    from attempts projected
    where projected.user_id = $1
      and (projected.outcome is null or projected.outcome in ('correct', 'incorrect'))
      and not (
        projected.run_item_id is null
        and projected.source = 'practice'
        and exists (
          select 1
          from attempts canonical
          where canonical.user_id = projected.user_id
            and canonical.run_item_id is not null
            and canonical.source = projected.source
            and canonical.task_id = projected.task_id
            and canonical.slot = projected.slot
            and canonical.started_at is not distinct from projected.started_at
            and canonical.submitted_at is not distinct from projected.submitted_at
            and canonical.answer is not distinct from projected.answer
            and canonical.outcome is not distinct from projected.outcome
            and canonical.help_level = projected.help_level
            and canonical.grading_kind is not distinct from projected.grading_kind
            and canonical.task_revision is not distinct from projected.task_revision
        )
      )
    order by created_at desc, id desc
    limit 1000
) recent
order by created_at, id;

-- name: ListAttemptJournal :many
with recent_attempt_ids as (
    select id
    from attempts projected
    where projected.user_id = sqlc.arg(user_id)
      and not (
        projected.run_item_id is null
        and projected.source = 'practice'
        and exists (
          select 1
          from attempts canonical
          where canonical.user_id = projected.user_id
            and canonical.run_item_id is not null
            and canonical.source = projected.source
            and canonical.task_id = projected.task_id
            and canonical.slot = projected.slot
            and canonical.started_at is not distinct from projected.started_at
            and canonical.submitted_at is not distinct from projected.submitted_at
            and canonical.answer is not distinct from projected.answer
            and canonical.outcome is not distinct from projected.outcome
            and canonical.help_level = projected.help_level
            and canonical.grading_kind is not distinct from projected.grading_kind
            and canonical.task_revision is not distinct from projected.task_revision
        )
      )
    order by coalesce(projected.submitted_at, projected.created_at) desc, projected.id desc
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

-- name: GetLatestSubmittedRun :one
select *
from runs
where user_id = $1
  and kind = $2
  and status = 'submitted'
order by submitted_at desc, id
limit 1;

-- name: RunHasAttemptAfter :one
select exists (
    select 1
    from attempts a
    join run_items i on i.id = a.run_item_id and i.user_id = a.user_id
    where i.run_id = sqlc.arg(run_id)
      and a.user_id = sqlc.arg(user_id)
      and coalesce(a.submitted_at, a.created_at) > sqlc.arg(submitted_at)
);

-- name: AbandonRun :one
update runs
set status = 'abandoned',
    updated_at = now()
where id = $1 and user_id = $2 and status = 'active'
returning *;

-- name: ListRuns :many
select *
from runs
where user_id = $1
order by started_at desc, id
limit $2;

-- name: ListCompletedSimulationRuns :many
select runs.*
from runs
where runs.user_id = $1
  and runs.kind = 'simulation'
  and runs.status = 'submitted'
  and runs.blueprint_version ~ '^ftn-p1:[0-9]{4}[.][0-9]+$'
  and runs.content_revision ~ '^sha256:[a-f0-9]{64}$'
  and runs.duration_ms between 0 and 4 * 60 * 60 * 1000
  and (
    runs.deadline_at is null
    or runs.deadline_at = runs.started_at + interval '4 hours'
  )
  and exists (
    select 1
    from run_items
    where run_items.run_id = runs.id
      and run_items.user_id = runs.user_id
    group by run_items.run_id, run_items.user_id
    having count(*) = 10
      and count(run_items.max_points) = 10
      and min(run_items.ordinal) = 1
      and max(run_items.ordinal) = 10
      and count(distinct run_items.exam_position) = 10
      and bool_and(run_items.ordinal = run_items.exam_position)
      and min(run_items.max_points) >= 1
      and sum(run_items.max_points) = 60
      and bool_and(run_items.task_revision ~ '^sha256:[a-f0-9]{64}$')
  )
  and not exists (
    select 1
    from attempts
    join run_items on run_items.id = attempts.run_item_id
      and run_items.user_id = attempts.user_id
    where run_items.run_id = runs.id
      and attempts.user_id = runs.user_id
      and (
        attempts.started_at is null
        or attempts.submitted_at is null
        or attempts.started_at < runs.started_at
        or attempts.submitted_at > runs.submitted_at
      )
  )
order by runs.submitted_at desc, runs.id
limit $2;

-- name: CanonicalizeSimulationDeadline :one
update runs
set deadline_at = sqlc.arg(deadline_at),
    updated_at = case
      when runs.deadline_at is null then now()
      else runs.updated_at
    end
where runs.id = sqlc.arg(id)
  and runs.user_id = sqlc.arg(user_id)
  and runs.kind = 'simulation'
  and (
    runs.deadline_at is null
    or runs.deadline_at = sqlc.arg(deadline_at)
  )
returning *;

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
    answer_part_count,
    task_revision
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning *;

-- name: ListRunItems :many
select *
from run_items
where run_id = $1 and user_id = $2
order by ordinal;

-- name: ListRunCheckpointRows :many
select checkpoint.run_id,
       checkpoint.user_id,
       checkpoint.version,
       checkpoint.current_ordinal,
       checkpoint.active_duration_ms,
       checkpoint.updated_at,
       draft.run_item_id,
       draft.answer
from run_checkpoints checkpoint
left join run_checkpoint_drafts draft
  on draft.run_id = checkpoint.run_id
 and draft.user_id = checkpoint.user_id
left join run_items item
  on item.run_id = draft.run_id
 and item.id = draft.run_item_id
 and item.user_id = draft.user_id
where checkpoint.run_id = $1 and checkpoint.user_id = $2
order by item.ordinal nulls last;

-- name: GetRunCheckpointForUpdate :one
select *
from run_checkpoints
where run_id = $1 and user_id = $2
for update;

-- name: CreateRunCheckpoint :one
insert into run_checkpoints (
    run_id,
    user_id,
    version,
    current_ordinal,
    active_duration_ms
)
values ($1, $2, 1, $3, $4)
returning *;

-- name: UpdateRunCheckpoint :one
update run_checkpoints
set version = version + 1,
    current_ordinal = $4,
    active_duration_ms = $5,
    updated_at = now()
where run_id = $1 and user_id = $2 and version = $3
returning *;

-- name: DeleteRunCheckpoint :exec
delete from run_checkpoints
where run_id = $1 and user_id = $2;

-- name: DeleteRunCheckpointDrafts :exec
delete from run_checkpoint_drafts
where run_id = $1 and user_id = $2;

-- name: CreateRunCheckpointDraft :one
insert into run_checkpoint_drafts (run_id, run_item_id, user_id, answer)
values ($1, $2, $3, $4)
returning *;

-- name: ListRunCheckpointDrafts :many
select draft.*
from run_checkpoint_drafts draft
join run_items item
  on item.run_id = draft.run_id
 and item.id = draft.run_item_id
 and item.user_id = draft.user_id
where draft.run_id = $1 and draft.user_id = $2
order by item.ordinal;

-- name: TouchRun :exec
update runs
set updated_at = now()
where id = $1 and user_id = $2;

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
    i.answer_part_count,
    i.task_revision,
    r.kind as run_kind,
    r.status as run_status,
    r.blueprint_version as run_blueprint_version,
    r.content_revision as run_content_revision,
    r.started_at as run_started_at,
    r.deadline_at as run_deadline_at,
    r.submitted_at as run_submitted_at,
    r.duration_ms as run_duration_ms
from run_items i
join runs r on r.id = i.run_id and r.user_id = i.user_id
where i.id = $1 and i.user_id = $2
for update of r;

-- name: CanonicalizeDiagnosticCheckpoint :one
update run_checkpoints
set current_ordinal = greatest(run_checkpoints.current_ordinal, sqlc.arg(current_ordinal)),
    updated_at = case
      when run_checkpoints.current_ordinal < sqlc.arg(current_ordinal)
        or exists (
          select 1
          from run_checkpoint_drafts
          where run_checkpoint_drafts.run_id = sqlc.arg(run_id)
            and run_checkpoint_drafts.user_id = sqlc.arg(user_id)
        )
        then now()
      else run_checkpoints.updated_at
    end
where run_id = sqlc.arg(run_id)
  and user_id = sqlc.arg(user_id)
  and version = sqlc.arg(version)
returning *;

-- name: ConsumeRunCheckpointDraft :one
with deleted as (
    delete from run_checkpoint_drafts
    where run_id = sqlc.arg(run_id)
      and run_item_id = sqlc.arg(run_item_id)
      and user_id = sqlc.arg(user_id)
    returning run_id, user_id
)
update run_checkpoints
set updated_at = now()
where run_checkpoints.run_id = sqlc.arg(run_id)
  and run_checkpoints.user_id = sqlc.arg(user_id)
  and exists (select 1 from deleted)
returning *;

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
