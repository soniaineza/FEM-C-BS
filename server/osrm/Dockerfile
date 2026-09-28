# Self-hosted OSRM for Rwanda, with the routing graph baked into the image.
# Deploy as a private service and point the API's OSRM_URL at it:
#   OSRM_URL=http://<this-service>:5000/route/v1/driving
# Rebuild periodically (e.g. weekly) to pick up new OpenStreetMap edits.
FROM ghcr.io/project-osrm/osrm-backend:latest
ADD https://download.geofabrik.de/africa/rwanda-latest.osm.pbf /data/rwanda-latest.osm.pbf
RUN osrm-extract -p /opt/car.lua /data/rwanda-latest.osm.pbf \
 && osrm-partition /data/rwanda-latest.osrm \
 && osrm-customize /data/rwanda-latest.osrm \
 && rm /data/rwanda-latest.osm.pbf
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--max-table-size", "1000", "/data/rwanda-latest.osrm"]
