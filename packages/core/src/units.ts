// US display units. The engine and the data stay metric (metres, km/h); only what a parent reads is converted.

const KM_PER_MILE = 1.609344;
const M_PER_MILE = 1609.344;

/** Speed in miles per hour, from km/h, as a short number: one decimal under 10, whole numbers above. */
export function fmtMph(kmh: number): string {
  const v = kmh / KM_PER_MILE;
  return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
}

/** Distance in miles, from km, to one decimal. */
export function fmtMi(km: number): string {
  return (Math.round((km / KM_PER_MILE) * 10) / 10).toFixed(1);
}

/** Metres to miles, to one decimal. */
export const metresToMiles = (m: number) => Math.round((m / M_PER_MILE) * 10) / 10;
