-- +goose Up
alter table users
    add constraint users_google_sub_size check (
        octet_length(google_sub) between 1 and 255
    ) not valid,
    add constraint users_email_size check (
        octet_length(email) between 3 and 320
    ) not valid,
    add constraint users_name_size check (
        char_length(name) between 1 and 256
    ) not valid,
    add constraint users_picture_url_size check (
        picture_url is null or octet_length(picture_url) between 1 and 2048
    ) not valid;

alter table users
    validate constraint users_google_sub_size,
    validate constraint users_email_size,
    validate constraint users_name_size,
    validate constraint users_picture_url_size;

-- +goose Down
alter table users
    drop constraint users_picture_url_size,
    drop constraint users_name_size,
    drop constraint users_email_size,
    drop constraint users_google_sub_size;
