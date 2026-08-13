-- +goose Up
create table prep_preferences (
    user_id uuid primary key references users (id) on delete cascade,
    goal_points smallint not null check (goal_points between 1 and 60),
    exam_date date not null check (
        exam_date between date '0001-01-01' and date '9999-12-31'
    ),
    version bigint not null default 1 check (version > 0),
    updated_at timestamptz not null default now()
);

-- +goose Down
drop table prep_preferences;
