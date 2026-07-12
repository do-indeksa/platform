-- +goose Up
create table attempts (
    id bigint generated always as identity primary key,
    user_id uuid not null references users (id) on delete cascade,
    task_id text not null,
    slot int not null check (slot between 1 and 10),
    correct boolean not null,
    source text not null check (source in ('diagnostic', 'practice', 'simulation')),
    created_at timestamptz not null default now()
);

create index attempts_user_id_created_at_idx on attempts (user_id, created_at);

-- +goose Down
drop table attempts;
