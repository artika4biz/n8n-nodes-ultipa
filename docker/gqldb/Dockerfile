# Ultipa GQLDB in a container — for running the database next to n8n (development,
# testing, self-hosted). There is no official image as of 2026-10; this one downloads
# the vendor's statically linked binary at build time and verifies it against the
# vendor's checksums.sha256. Version and checksum are pinned on purpose: an update is a
# new build with new values, never `latest`.
#
# Source: https://download.ultipa.com/gqldb/v<VERSION>/
# License of the binary: see the notice GQLDB prints on start (Community Edition).
FROM debian:bookworm-slim

ARG ULTIPA_VERSION=6.2.155
ARG ULTIPA_SHA256=0ff9c300ef2c895378fd668a7b7ef779149f75d937e5b04987b62142cb86ba91

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/ultipa-gqldb \
      "https://download.ultipa.com/gqldb/v${ULTIPA_VERSION}/ultipa-gqldb-${ULTIPA_VERSION}-linux-amd64" \
 && echo "${ULTIPA_SHA256}  /usr/local/bin/ultipa-gqldb" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/ultipa-gqldb \
 && useradd --system --uid 10900 --home /data --shell /usr/sbin/nologin ultipa \
 && mkdir -p /data && chown ultipa:ultipa /data

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

USER ultipa
WORKDIR /data
VOLUME ["/data"]
EXPOSE 9000
# Liveness: the gRPC port answers. A shell check cannot know more than that.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/9000' || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
