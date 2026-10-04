const { config } = require('../../config');
const { ApiError } = require('../../utils/asyncHandler');

// One adapter per map provider. Each exposes only what it can really do:
//   route(from, to)            -> { coordinates:[[lng,lat]], distanceMeters, durationSeconds }
//   matrix(points)             -> seconds[][]            (optional)
//   search(query, near)        -> [{ name, street, city, country, latitude, longitude }]
//   reverse(latitude, longitude) -> { name, street, city, country } | null
// Adapters throw MapProviderError; they never invent a result. API keys are
// read from server config only and never leave the server.

/** A map provider could not answer. `reason` is one of: timeout,
 * rate_limited, unavailable, no_result, not_configured. */
class MapProviderError extends ApiError {
  constructor(reason, provider, detail = '') {
    super(503, 'The map service is not responding. Please try again.', 'MAP_SERVICE_UNAVAILABLE');
    this.reason = reason;
    this.provider = provider;
    this.detail = detail;
  }
}

async function getJson(provider, url, { timeoutMs = config.mapProviderTimeoutMs, method = 'GET', body, headers } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(headers || {}) },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new MapProviderError(timedOut ? 'timeout' : 'unavailable', provider, err && err.message);
  }
  if (res.status === 429) throw new MapProviderError('rate_limited', provider, 'HTTP 429');
  if (!res.ok) throw new MapProviderError('unavailable', provider, `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new MapProviderError('unavailable', provider, 'invalid JSON');
  }
}

// ---------------------------------------------------------------- OSRM
// Open Source Routing Machine. OSRM_URL is the route service base, e.g.
// http://<host>:5000/route/v1/driving for a self-hosted Rwanda graph
// (server/osrm/). The default is the project's public demo server, which is
// for development only.
const osrm = {
  name: 'osrm',
  async route(from, to) {
    const data = await getJson(
      'osrm',
      `${config.osrmUrl}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`
    );
    const route = Array.isArray(data.routes) ? data.routes[0] : null;
    const coordinates = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coordinates) || coordinates.length < 2) {
      throw new MapProviderError('no_result', 'osrm', 'no route');
    }
    return { coordinates, distanceMeters: route.distance, durationSeconds: route.duration };
  },
  async matrix(points) {
    const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
    const data = await getJson('osrm', `${config.osrmUrl.replace('/route/', '/table/')}/${coords}`, { timeoutMs: 4000 });
    if (data.code !== 'Ok' || !Array.isArray(data.durations)) throw new MapProviderError('unavailable', 'osrm', 'bad table');
    return data.durations;
  },
};

// ---------------------------------------------------------------- Geoapify
// https://apidocs.geoapify.com — routing, autocomplete and reverse geocoding
// on one API key (MAP_ROUTING_API_KEY / MAP_GEOCODING_API_KEY).
const GEOAPIFY = 'https://api.geoapify.com/v1';
const geoapify = {
  name: 'geoapify',
  async route(from, to) {
    if (!config.mapRoutingApiKey) throw new MapProviderError('not_configured', 'geoapify', 'MAP_ROUTING_API_KEY is not set');
    const data = await getJson(
      'geoapify',
      `${GEOAPIFY}/routing?waypoints=${from.latitude},${from.longitude}|${to.latitude},${to.longitude}` +
        `&mode=drive&apiKey=${encodeURIComponent(config.mapRoutingApiKey)}`
    );
    const feature = Array.isArray(data.features) ? data.features[0] : null;
    // geometry is a MultiLineString: one LineString per leg, [lng, lat] pairs.
    const lines = feature?.geometry?.coordinates;
    const coordinates = Array.isArray(lines) ? lines.flat() : [];
    const distanceMeters = Number(feature?.properties?.distance);
    const durationSeconds = Number(feature?.properties?.time);
    if (coordinates.length < 2 || !Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
      throw new MapProviderError('no_result', 'geoapify', 'no route');
    }
    if (feature.properties.distance_units && String(feature.properties.distance_units).toLowerCase() !== 'meters') {
      throw new MapProviderError('unavailable', 'geoapify', `unexpected distance unit ${feature.properties.distance_units}`);
    }
    return { coordinates, distanceMeters, durationSeconds };
  },
  async search(query, near) {
    if (!config.mapGeocodingApiKey) throw new MapProviderError('not_configured', 'geoapify', 'MAP_GEOCODING_API_KEY is not set');
    const bias = near ? `&bias=proximity:${near.longitude},${near.latitude}` : '';
    const data = await getJson(
      'geoapify',
      `${GEOAPIFY}/geocode/autocomplete?text=${encodeURIComponent(query)}&filter=countrycode:rw${bias}` +
        `&limit=15&lang=en&format=json&apiKey=${encodeURIComponent(config.mapGeocodingApiKey)}`
    );
    return (Array.isArray(data.results) ? data.results : []).map((r) => ({
      name: r.name || r.address_line1 || undefined,
      street: r.street || undefined,
      city: r.city || r.county || undefined,
      country: r.country || undefined,
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }));
  },
  async reverse(latitude, longitude) {
    if (!config.mapGeocodingApiKey) throw new MapProviderError('not_configured', 'geoapify', 'MAP_GEOCODING_API_KEY is not set');
    const data = await getJson(
      'geoapify',
      `${GEOAPIFY}/geocode/reverse?lat=${latitude}&lon=${longitude}&lang=en&format=json` +
        `&apiKey=${encodeURIComponent(config.mapGeocodingApiKey)}`
    );
    const r = Array.isArray(data.results) ? data.results[0] : null;
    if (!r) return null;
    return {
      name: r.name || r.address_line1 || undefined,
      street: r.street || undefined,
      city: r.suburb || r.city || r.county || undefined,
      country: r.country || undefined,
    };
  },
};

// ---------------------------------------------------------------- Photon (+ Nominatim)
// OpenStreetMap geocoders. PHOTON_URL / PHOTON_REVERSE_URL default to the
// public komoot server (development only); NOMINATIM_* is an optional
// fallback. Both are free to self-host.
// Rwanda's bounding box (minLon, minLat, maxLon, maxLat): without it Photon
// matches same-named places across the whole planet first.
const RWANDA_BBOX = '28.8617,-2.8407,30.8990,-1.0475';
const NOMINATIM_HEADERS = { 'User-Agent': 'KimuTransportApp/1.0 (mobile app; https://kimutransport.rw)' };
const nominatimAllowed = () => config.env !== 'production' || Boolean(process.env.NOMINATIM_URL);

const photon = {
  name: 'photon',
  async search(query) {
    let features = [];
    let failure = null;
    try {
      const data = await getJson('photon', `${config.photonUrl}?limit=15&lang=en&q=${encodeURIComponent(query)}&bbox=${RWANDA_BBOX}`);
      features = Array.isArray(data.features) ? data.features : [];
    } catch (err) {
      failure = err;
    }
    if (features.length) {
      return features.map((f) => ({
        name: f.properties?.name,
        street: f.properties?.street,
        city: f.properties?.city,
        state: f.properties?.state,
        country: f.properties?.country,
        latitude: Number(f.geometry?.coordinates?.[1]),
        longitude: Number(f.geometry?.coordinates?.[0]),
      }));
    }
    // Photon down, or it has not indexed this Rwandan place: try Nominatim.
    if (nominatimAllowed()) {
      try {
        const rows = await getJson(
          'nominatim',
          `${config.nominatimUrl}?format=jsonv2&limit=8&countrycodes=rw&addressdetails=1&q=${encodeURIComponent(query)}`,
          { headers: NOMINATIM_HEADERS }
        );
        return (Array.isArray(rows) ? rows : []).map((r) => ({
          name: r.name || undefined,
          street: r.address?.road ?? r.address?.pedestrian ?? undefined,
          city: r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.district ?? undefined,
          country: r.address?.country ?? undefined,
          latitude: Number(r.lat),
          longitude: Number(r.lon),
        }));
      } catch (err) {
        failure = failure || err;
      }
    }
    if (failure) throw failure;
    return [];
  },
  async reverse(latitude, longitude) {
    let failure = null;
    try {
      const data = await getJson('photon', `${config.photonReverseUrl}?lat=${latitude}&lon=${longitude}&lang=en`, { timeoutMs: 3500 });
      const p = Array.isArray(data.features) ? data.features[0]?.properties : null;
      if (p) return { name: p.name, street: p.street, city: p.city, state: p.state, country: p.country };
    } catch (err) {
      failure = err;
    }
    if (config.env !== 'production' || process.env.NOMINATIM_REVERSE_URL) {
      try {
        const r = await getJson(
          'nominatim',
          `${config.nominatimReverseUrl}?format=jsonv2&zoom=18&addressdetails=1&lat=${latitude}&lon=${longitude}`,
          { headers: NOMINATIM_HEADERS, timeoutMs: 5000 }
        );
        if (r && !r.error) {
          return {
            name: r.name || undefined,
            street: r.address?.road ?? r.address?.pedestrian ?? undefined,
            city: r.address?.city ?? r.address?.town ?? r.address?.suburb ?? r.address?.district ?? undefined,
            country: r.address?.country ?? undefined,
          };
        }
      } catch (err) {
        failure = failure || err;
      }
    }
    if (failure) throw failure;
    return null;
  },
};

const ROUTING_PROVIDERS = { osrm, geoapify };
const GEOCODING_PROVIDERS = { photon, geoapify };

function routingProvider() {
  const provider = ROUTING_PROVIDERS[config.mapRoutingProvider];
  if (!provider) throw new MapProviderError('not_configured', config.mapRoutingProvider, 'unknown MAP_ROUTING_PROVIDER');
  return provider;
}

function geocodingProvider() {
  const provider = GEOCODING_PROVIDERS[config.mapGeocodingProvider];
  if (!provider) throw new MapProviderError('not_configured', config.mapGeocodingProvider, 'unknown MAP_GEOCODING_PROVIDER');
  return provider;
}

module.exports = {
  MapProviderError,
  routingProvider,
  geocodingProvider,
  ROUTING_PROVIDERS: Object.keys(ROUTING_PROVIDERS),
  GEOCODING_PROVIDERS: Object.keys(GEOCODING_PROVIDERS),
};
