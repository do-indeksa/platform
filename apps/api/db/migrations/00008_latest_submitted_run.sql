-- +goose Up
create index runs_user_kind_submitted_at_idx
on runs (user_id, kind, submitted_at desc, id)
where status = 'submitted';

-- +goose Down
drop index runs_user_kind_submitted_at_idx;
