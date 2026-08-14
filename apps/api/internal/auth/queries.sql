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

-- name: ExtendSession :execrows
update sessions
set expires_at = $2
where token_hash = $1 and expires_at > now();

-- name: DeleteSession :exec
delete from sessions where token_hash = $1;

-- name: DeleteAccountBySession :execrows
delete from users
where id = (
    select user_id
    from sessions
    where token_hash = $1 and expires_at > now()
);

-- name: DeleteExpiredSessionsBatch :execrows
with expired as (
    select token_hash
    from sessions
    where expires_at <= now()
    order by expires_at
    limit sqlc.arg(batch_size)
    for update skip locked
)
delete from sessions
using expired
where sessions.token_hash = expired.token_hash
    and sessions.expires_at <= now();

-- name: DeleteExpiredAuthCodesBatch :execrows
with expired as (
    select code_hash
    from auth_codes
    where expires_at <= now()
    order by expires_at
    limit sqlc.arg(batch_size)
    for update skip locked
)
delete from auth_codes
using expired
where auth_codes.code_hash = expired.code_hash
    and auth_codes.expires_at <= now();

-- name: CreateAuthCode :exec
insert into auth_codes (
    code_hash,
    user_id,
    origin,
    redirect,
    browser_binding_id,
    browser_binding_hash,
    expires_at
)
values ($1, $2, $3, $4, $5, $6, $7);

-- name: ConsumeAuthCode :one
delete from auth_codes
where code_hash = $1
    and origin = $2
    and browser_binding_id = $3
    and browser_binding_hash = $4
    and expires_at > now()
returning user_id, redirect;
