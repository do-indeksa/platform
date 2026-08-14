-- +goose Up
create index attempts_user_id_journal_order_idx
on attempts (user_id, (coalesce(submitted_at, created_at)) desc, id desc);

-- +goose Down
drop index attempts_user_id_journal_order_idx;
