-- name: InsertAttempts :copyfrom
insert into attempts (user_id, task_id, slot, correct, source, created_at)
values ($1, $2, $3, $4, $5, $6);

-- name: ListAttempts :many
select task_id, slot, correct, source, created_at
from (
    select id, task_id, slot, correct, source, created_at
    from attempts
    where user_id = $1
    order by created_at desc, id desc
    limit 1000
) recent
order by created_at, id;
