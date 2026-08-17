-- +goose Up
create index auth_codes_user_id_idx on auth_codes (user_id);

-- +goose Down
drop index auth_codes_user_id_idx;
