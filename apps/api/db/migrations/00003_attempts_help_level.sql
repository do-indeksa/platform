-- +goose Up
alter table attempts
add column help_level smallint not null default 0 check (help_level between 0 and 3);

-- +goose Down
alter table attempts
drop column help_level;
