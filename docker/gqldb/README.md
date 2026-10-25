# Run Ultipa GQLDB in Docker (for n8n)

A small, pinned container build for the Ultipa GQLDB server, so you can try
`n8n-nodes-ultipa` without installing anything on the host. There is no official GQLDB
image; this Dockerfile downloads the vendor's statically linked Linux binary at build
time and verifies it against the vendor's `checksums.sha256`.

Tested 2026-10-24 on a self-hosted n8n 2.44.6 with this node (0.2.0):
`RETURN db.version()` → `gqldb-grpc 6.2.155 (core v1.1.415) [Community Edition]`.

## Quick start

```bash
cd docker/gqldb
cp .env.example .env && chmod 600 .env       # set ULTIPA_ADMIN_PASS
mkdir -p data && sudo chown 10900:10900 data # the container runs as uid 10900
docker compose build
docker compose up -d ultipa-gql
docker logs --since 1m ultipa-gql | grep -E 'gRPC server|RBAC|ERROR'
```

You should see `Starting gRPC server address=:9000` and `RBAC authentication is enabled`.

## Connect from n8n

Credential **Ultipa API**:

| Field | Value |
|---|---|
| Host | `ultipa-gql:9000` (same Docker network) — or `host.docker.internal:9000` if n8n runs elsewhere |
| Username | `admin` |
| Password | `ULTIPA_ADMIN_PASS` from `.env` |
| Use TLS | off |

The credential test shows "Invalid URL" because gRPC uses `host:port`, not a URL; it is
validated on the first workflow run. Then: Manual Trigger → Ultipa → Query → Execute GQL →
`RETURN db.version()`.

The optional `n8n` service in the compose file gives you a throwaway n8n on
`http://127.0.0.1:5678`. Install the node into it:

```bash
docker compose up -d n8n
docker exec -u node n8n-ultipa-dev sh -c 'mkdir -p ~/.n8n/custom && cd ~/.n8n/custom \
  && npm init -y >/dev/null && npm install --legacy-peer-deps \
  https://github.com/artika4biz/n8n-nodes-ultipa/raw/main/n8n-nodes-ultipa-0.2.0.tgz'
docker restart n8n-ultipa-dev
```

n8n loads `~/.n8n/custom` automatically; no `N8N_CUSTOM_EXTENSIONS` needed.

## Updating

Pick the version and its checksum from the vendor, then rebuild:

```bash
curl -fsSL https://download.ultipa.com/gqldb/VERSION
curl -fsSL https://download.ultipa.com/gqldb/v<VERSION>/checksums.sha256 | grep linux-amd64
```

Set `ULTIPA_VERSION` and `ULTIPA_SHA256` in the Dockerfile (and the `image:` tag in the
compose file), then `docker compose build && docker compose up -d`. Data lives in `./data`
and survives rebuilds.

## Notes

- Embedded developer license: 3 graphs, 1,000,000 nodes/edges, no license file. The
  binary prints a Community Edition notice on start; check the terms for anything beyond
  personal, non-commercial use.
- The image is not published to a registry on purpose: distributing the binary is the
  vendor's call. Build it locally.
- Backup: GQLDB has no dump command; back up `./data` with the container stopped, or
  accept a best-effort copy (the WAL makes it consistent on next start).
- Only `linux/amd64` is wired; the vendor also ships `linux-arm64` (adjust filename and
  checksum).
