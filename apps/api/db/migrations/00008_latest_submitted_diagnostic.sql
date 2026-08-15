-- +goose Up
create index runs_latest_submitted_diagnostic_idx
on runs (user_id, submitted_at desc, id desc)
where kind = 'diagnostic' and status = 'submitted';

-- +goose Down
drop index runs_latest_submitted_diagnostic_idx;
