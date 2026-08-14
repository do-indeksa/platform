-- name: UpsertUser :one
insert into users (google_sub, email, name, picture_url)
values ($1, $2, $3, $4)
on conflict (google_sub) do update
set email = excluded.email, name = excluded.name, picture_url = excluded.picture_url
returning *;

-- name: CreateSession :exec
insert into sessions (token_hash, user_id, expires_at)
values (
    sqlc.arg(token_hash),
    sqlc.arg(user_id),
    now() + (sqlc.arg(ttl_seconds)::integer * interval '1 second')
);

-- name: GetSessionUser :one
select sqlc.embed(users),
       sessions.expires_at <
         now() + (sqlc.arg(refresh_window_seconds)::integer * interval '1 second') as refresh_due
from sessions
join users on users.id = sessions.user_id
where sessions.token_hash = sqlc.arg(token_hash)
  and sessions.expires_at > now();

-- name: ExtendSession :execrows
update sessions
set expires_at = greatest(
    expires_at,
    now() + (sqlc.arg(ttl_seconds)::integer * interval '1 second')
)
where token_hash = sqlc.arg(token_hash)
  and expires_at > now();

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
values (
    sqlc.arg(code_hash),
    sqlc.arg(user_id),
    sqlc.arg(origin),
    sqlc.arg(redirect),
    sqlc.arg(browser_binding_id),
    sqlc.arg(browser_binding_hash),
    now() + (sqlc.arg(ttl_seconds)::integer * interval '1 second')
);

-- name: ConsumeAuthCode :one
delete from auth_codes
where code_hash = $1
    and origin = $2
    and browser_binding_id = $3
    and browser_binding_hash = $4
    and expires_at > now()
returning user_id, redirect;
