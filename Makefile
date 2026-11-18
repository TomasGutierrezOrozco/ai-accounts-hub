BINARY := ai-accounts-hub
PORT ?= 8080
DB ?= ./ai-accounts-hub.db

.PHONY: build run test fmt vet clean docker

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BINARY) .

run: build
	./$(BINARY) -port $(PORT) -db $(DB)

test:
	go test -count=1 -v ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

clean:
	rm -f $(BINARY) $(BINARY)-* *.exe

docker:
	docker compose up -d --build
