-- +goose Up
create table users (
    id uuid primary key default gen_random_uuid(),
    google_sub text not null unique,
    email text not null,
    name text not null,
    picture_url text,
    created_at timestamptz not null default now()
);

create table sessions (
    token_hash bytea primary key,
    user_id uuid not null references users (id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index sessions_user_id_idx on sessions (user_id);

create table auth_codes (
    code_hash bytea primary key,
    user_id uuid not null references users (id) on delete cascade,
    redirect text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

-- +goose Down
drop table auth_codes;
drop table sessions;
drop table users;
