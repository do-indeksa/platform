-- name: UpsertUser :one
insert into users (google_sub, email, name, picture_url)
values ($1, $2, $3, $4)
on conflict (google_sub) do update
set email = excluded.email, name = excluded.name, picture_url = excluded.picture_url
returning *;

-- name: CreateSession :exec
insert into sessions (token_hash, user_id, expires_at)
values ($1, $2, $3);

-- name: GetSessionUser :one
select sqlc.embed(users), sessions.expires_at
from sessions
join users on users.id = sessions.user_id
where sessions.token_hash = $1 and sessions.expires_at > now();

-- name: ExtendSession :exec
update sessions set expires_at = $2 where token_hash = $1;

-- name: DeleteSession :exec
delete from sessions where token_hash = $1;

-- name: DeleteExpiredSessions :exec
delete from sessions where expires_at <= now();

-- name: DeleteExpiredAuthCodes :exec
delete from auth_codes where expires_at <= now();

-- name: CreateAuthCode :exec
insert into auth_codes (code_hash, user_id, redirect, expires_at)
values ($1, $2, $3, $4);

-- name: ConsumeAuthCode :one
delete from auth_codes
where code_hash = $1 and expires_at > now()
returning user_id, redirect;
