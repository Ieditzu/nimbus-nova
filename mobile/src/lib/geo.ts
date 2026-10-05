export interface LatLng {
  lat: number;
  lng: number;
}
export interface RouteInfo {
  distanceM: number;
  durationS: number;
  points: LatLng[];
}
export interface Place extends LatLng {
  label: string;
}

/** The API stores 0,0 when a task has no location. */
export function hasLocation(p: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    !(p.lat === 0 && p.lng === 0) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace(".", ",")} km`;
}

export function googleMapsUrl(dest: LatLng, origin?: LatLng): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving",
  });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

export function googleMapsSearchUrl(place: string): string {
  const params = new URLSearchParams({ api: "1", query: place.trim() });
  return `https://www.google.com/maps/search/?${params}`;
}

export function taskMapsUrl(task: { lat: number; lng: number; sector?: string; city: string; county?: string }, exact: boolean): string {
  if (exact && hasLocation(task)) return googleMapsUrl({ lat: task.lat, lng: task.lng });
  return googleMapsSearchUrl([task.sector, task.city, task.county, "România"].filter(Boolean).join(", "));
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Serviciul de hărți nu răspunde.");
  return response.json();
}

/** Address search via OpenStreetMap Nominatim, limited to Romania. */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "5",
    countrycodes: "ro",
    "accept-language": "ro",
  });
  const data = (await getJson(
    `https://nominatim.openstreetmap.org/search?${params}`,
    signal,
  )) as { lat: string; lon: string; display_name: string }[];
  return data
    .map((item) => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      label: item.display_name,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Driving route and ETA via the OSRM demo server. */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<RouteInfo> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const data = (await getJson(url, signal)) as {
    code?: string;
    routes?: {
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }[];
  };
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route)
    throw new Error("Nu am găsit un traseu către această locație.");
  return {
    distanceM: route.distance,
    durationS: route.duration,
    points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  };
}

/** Fit points into a width x height box (Web-Mercator-ish, fine at city scale). */
export function projectPoints(
  points: LatLng[],
  width: number,
  height: number,
  pad = 24,
): { x: number; y: number }[] {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return points.map((p) => ({
    x: offX + (p.lng - minLng) * cos * scale,
    y: offY + (maxLat - p.lat) * scale,
  }));
}
