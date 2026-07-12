# api

Go monolith. Serves user data only — content lives in `content/`.

```
go run ./cmd/api    # local server on :8080
go test ./...
```

Postgres (pgx + sqlc + goose) arrives with the first user-data feature.
