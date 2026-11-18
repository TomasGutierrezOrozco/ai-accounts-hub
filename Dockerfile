FROM golang:1.26-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/ai-accounts-hub .

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/ai-accounts-hub /ai-accounts-hub

EXPOSE 8080
ENV PORT=8080
ENV AI_HUB_DB=/data/ai-accounts-hub.db

ENTRYPOINT ["/ai-accounts-hub"]
