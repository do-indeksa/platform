-- +goose Up
create index sessions_expires_at_idx on sessions (expires_at);
create index auth_codes_expires_at_idx on auth_codes (expires_at);

-- +goose Down
drop index auth_codes_expires_at_idx;
drop index sessions_expires_at_idx;
