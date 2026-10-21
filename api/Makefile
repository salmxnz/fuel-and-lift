# Tests that touch the database reset its schema, so packages run one at a time.
.PHONY: run migrate vapid test test-db fmt vet build

run:
	go run ./cmd/api

migrate:
	go run ./cmd/api migrate

vapid:
	go run ./cmd/api vapid

test:
	go test -p 1 ./...

# Needs a throwaway database, e.g.
#   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/fuel_test?sslmode=disable make test-db
test-db:
	@test -n "$$TEST_DATABASE_URL" || (echo "set TEST_DATABASE_URL" && exit 1)
	go test -p 1 -race ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

build:
	CGO_ENABLED=0 go build -o bin/api ./cmd/api
