-- +goose Up
alter table run_items
add column answer_part_count smallint
check (answer_part_count between 1 and 6);

-- +goose Down
alter table run_items
drop column answer_part_count;
