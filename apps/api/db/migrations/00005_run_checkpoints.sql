-- +goose Up
alter table run_items
add constraint run_items_run_id_id_user_id_key unique (run_id, id, user_id);

create table run_checkpoints (
    run_id uuid primary key,
    user_id uuid not null,
    version bigint not null check (version >= 1),
    current_ordinal smallint not null check (current_ordinal between 1 and 100),
    active_duration_ms bigint check (active_duration_ms >= 0),
    updated_at timestamptz not null default now(),
    unique (run_id, user_id),
    foreign key (run_id, user_id) references runs (id, user_id) on delete cascade
);

create table run_checkpoint_drafts (
    run_id uuid not null,
    run_item_id uuid not null,
    user_id uuid not null,
    answer text not null check (char_length(answer) between 1 and 8192),
    primary key (run_id, run_item_id),
    foreign key (run_id, user_id)
        references run_checkpoints (run_id, user_id) on delete cascade,
    foreign key (run_id, run_item_id, user_id)
        references run_items (run_id, id, user_id) on delete cascade
);

-- +goose Down
drop table run_checkpoint_drafts;
drop table run_checkpoints;

alter table run_items
drop constraint run_items_run_id_id_user_id_key;
