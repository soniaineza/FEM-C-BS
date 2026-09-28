#!/usr/bin/env bash
# Builds a self-hosted OSRM routing graph for Rwanda from OpenStreetMap
# (Geofabrik extract, refreshed daily) and serves it on :5000.
#
# The public router.project-osrm.org demo is for non-commercial use at up to
# 1 request/second, so a production ride-hailing app must run its own. The
# Rwanda graph is small: ~70 MB download, a few minutes to build.
#
#   ./build-rwanda.sh          # download + build into ./data
#   ./build-rwanda.sh serve    # run the router on http://localhost:5000
# Then set OSRM_URL=http://localhost:5000/route/v1/driving for the API.
set -euo pipefail
cd "$(dirname "$0")"
IMAGE=ghcr.io/project-osrm/osrm-backend:latest
DATA=$PWD/data
mkdir -p "$DATA"

if [[ "${1:-}" == "serve" ]]; then
  exec docker run --rm -p 5000:5000 -v "$DATA:/data" "$IMAGE" \
    osrm-routed --algorithm mld --max-table-size 1000 /data/rwanda-latest.osrm
fi

curl -fL -o "$DATA/rwanda-latest.osm.pbf" https://download.geofabrik.de/africa/rwanda-latest.osm.pbf
docker run --rm -v "$DATA:/data" "$IMAGE" osrm-extract -p /opt/car.lua /data/rwanda-latest.osm.pbf
docker run --rm -v "$DATA:/data" "$IMAGE" osrm-partition /data/rwanda-latest.osrm
docker run --rm -v "$DATA:/data" "$IMAGE" osrm-customize /data/rwanda-latest.osrm
echo "OSRM Rwanda graph ready in $DATA — run: $0 serve"
