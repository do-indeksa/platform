-- +goose Up
create table training_builder_drafts (
    user_id uuid primary key references users (id) on delete cascade,
    blueprint_version text not null check (
        char_length(blueprint_version) between 1 and 16
        and blueprint_version ~ '^[0-9]{4}[.][0-9]+$'
    ),
    position_1_quantity smallint not null default 0 check (position_1_quantity between 0 and 10),
    position_2_quantity smallint not null default 0 check (position_2_quantity between 0 and 10),
    position_3_quantity smallint not null default 0 check (position_3_quantity between 0 and 10),
    position_4_quantity smallint not null default 0 check (position_4_quantity between 0 and 10),
    position_5_quantity smallint not null default 0 check (position_5_quantity between 0 and 10),
    position_6_quantity smallint not null default 0 check (position_6_quantity between 0 and 10),
    position_7_quantity smallint not null default 0 check (position_7_quantity between 0 and 10),
    position_8_quantity smallint not null default 0 check (position_8_quantity between 0 and 10),
    position_9_quantity smallint not null default 0 check (position_9_quantity between 0 and 10),
    position_10_quantity smallint not null default 0 check (position_10_quantity between 0 and 10),
    difficulty text not null check (difficulty in ('foundation', 'balanced', 'advanced')),
    only_new boolean not null,
    shuffle boolean not null,
    prioritize_mistakes boolean not null,
    version bigint not null default 1 check (version > 0),
    updated_at timestamptz not null default now(),
    check (
        position_1_quantity + position_2_quantity + position_3_quantity
        + position_4_quantity + position_5_quantity + position_6_quantity
        + position_7_quantity + position_8_quantity + position_9_quantity
        + position_10_quantity <= 10
    )
);

-- +goose Down
drop table training_builder_drafts;
