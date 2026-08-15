-- +goose Up
alter table auth_codes
    add column origin text,
    add column browser_binding_id text,
    add column browser_binding_hash bytea,
    add constraint auth_codes_origin_length check (length(origin) between 1 and 512),
    add constraint auth_codes_binding_id_format check (
        browser_binding_id ~ '^[A-Za-z0-9_-]{22}$'
    ),
    add constraint auth_codes_binding_hash_length check (
        octet_length(browser_binding_hash) = 32
    ),
    add constraint auth_codes_binding_all_or_none check (
        (origin is null and browser_binding_id is null and browser_binding_hash is null)
        or
        (origin is not null and browser_binding_id is not null and browser_binding_hash is not null)
    );

-- +goose Down
alter table auth_codes
    drop constraint auth_codes_binding_all_or_none,
    drop constraint auth_codes_binding_hash_length,
    drop constraint auth_codes_binding_id_format,
    drop constraint auth_codes_origin_length,
    drop column browser_binding_hash,
    drop column browser_binding_id,
    drop column origin;
