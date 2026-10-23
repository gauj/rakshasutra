/**
 * Small map maths: distances, bearings, compass names and local-time helpers.
 * Plain spherical-earth formulas; accurate enough for a few kilometres around a child.
 */
// Mean earth radius in metres.
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in metres between two points. */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial compass bearing from a to b, 0 to 360 degrees clockwise from north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point reached by travelling distM metres from a along a bearing. Used to project a 10-minute path. */
export function destination(a: LatLon, bearing: number, distM: number): LatLon {
  const d = distM / R;
  const br = rad(bearing);
  const lat1 = rad(a.lat);
  const lon1 = rad(a.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 =
    lon1 +
    Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: deg(lon2) };
}

// 16-point compass, 22.5 degrees each.
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
/** Name of the nearest of 16 compass points for a bearing (for example 56 becomes "NE"). */
export function compass(bearing: number): string {
  return POINTS[Math.round(bearing / 22.5) % 16] ?? "N";
}

/** Local time of day as a fractional hour (14.5 = 14:30), given the child's offset in minutes east of UTC. */
export function localHour(ts: number, tzOffsetMin: number): number {
  const d = new Date(ts + tzOffsetMin * 60000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** True if the hour falls in [start, end). A range that crosses midnight, such as 22 to 5, is handled. */
export function inQuietHours(hour: number, [start, end]: [number, number]): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}
