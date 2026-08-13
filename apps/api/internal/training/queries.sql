-- name: GetBuilderDraft :one
select *
from training_builder_drafts
where user_id = $1;

-- name: CreateBuilderDraft :one
insert into training_builder_drafts (
    user_id,
    blueprint_version,
    position_1_quantity,
    position_2_quantity,
    position_3_quantity,
    position_4_quantity,
    position_5_quantity,
    position_6_quantity,
    position_7_quantity,
    position_8_quantity,
    position_9_quantity,
    position_10_quantity,
    difficulty,
    only_new,
    shuffle,
    prioritize_mistakes
)
values (
    sqlc.arg(user_id),
    sqlc.arg(blueprint_version),
    sqlc.arg(position_1_quantity),
    sqlc.arg(position_2_quantity),
    sqlc.arg(position_3_quantity),
    sqlc.arg(position_4_quantity),
    sqlc.arg(position_5_quantity),
    sqlc.arg(position_6_quantity),
    sqlc.arg(position_7_quantity),
    sqlc.arg(position_8_quantity),
    sqlc.arg(position_9_quantity),
    sqlc.arg(position_10_quantity),
    sqlc.arg(difficulty),
    sqlc.arg(only_new),
    sqlc.arg(shuffle),
    sqlc.arg(prioritize_mistakes)
)
on conflict (user_id) do nothing
returning *;

-- name: UpdateBuilderDraft :one
update training_builder_drafts
set blueprint_version = sqlc.arg(blueprint_version),
    position_1_quantity = sqlc.arg(position_1_quantity),
    position_2_quantity = sqlc.arg(position_2_quantity),
    position_3_quantity = sqlc.arg(position_3_quantity),
    position_4_quantity = sqlc.arg(position_4_quantity),
    position_5_quantity = sqlc.arg(position_5_quantity),
    position_6_quantity = sqlc.arg(position_6_quantity),
    position_7_quantity = sqlc.arg(position_7_quantity),
    position_8_quantity = sqlc.arg(position_8_quantity),
    position_9_quantity = sqlc.arg(position_9_quantity),
    position_10_quantity = sqlc.arg(position_10_quantity),
    difficulty = sqlc.arg(difficulty),
    only_new = sqlc.arg(only_new),
    shuffle = sqlc.arg(shuffle),
    prioritize_mistakes = sqlc.arg(prioritize_mistakes),
    version = version + 1,
    updated_at = now()
where user_id = sqlc.arg(user_id)
  and version = sqlc.arg(expected_version)
  and version < 9223372036854775807
returning *;
