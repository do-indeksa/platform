-- name: GetPreferences :one
select goal_points,
       to_char(exam_date, 'YYYY-MM-DD') as exam_date,
       version,
       updated_at
from prep_preferences
where user_id = $1;

-- name: CreatePreferences :one
insert into prep_preferences (user_id, goal_points, exam_date)
values (sqlc.arg(user_id), sqlc.arg(goal_points), sqlc.arg(exam_date)::date)
on conflict (user_id) do nothing
returning goal_points,
          to_char(exam_date, 'YYYY-MM-DD') as exam_date,
          version,
          updated_at;

-- name: UpdatePreferences :one
update prep_preferences
set goal_points = sqlc.arg(goal_points),
    exam_date = sqlc.arg(exam_date)::date,
    version = version + 1,
    updated_at = now()
where user_id = sqlc.arg(user_id)
  and version = sqlc.arg(expected_version)
  and version < 9223372036854775807
returning goal_points,
          to_char(exam_date, 'YYYY-MM-DD') as exam_date,
          version,
          updated_at;
