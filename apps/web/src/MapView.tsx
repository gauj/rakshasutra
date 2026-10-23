import L from "leaflet";
import { useEffect, useRef } from "react";
import type { Alert, Ping, Zone } from "@rakshasutra/core";

interface Props {
  zones: Zone[];
  trail: Ping[];
  last?: Ping;
  alert?: Alert;
  /** First letter of the child's name, shown on the marker. */
  initial?: string;
  /** The child's picture (a small image data URL). Shown on the marker instead of the initial. */
  photo?: string;
  className?: string;
  /** When set, tapping the map picks a spot (used to place home, school and so on). */
  onPick?: (lat: number, lon: number) => void;
  /** A spot the parent has picked, shown as a pin. */
  pick?: { lat: number; lon: number };
}

/** Read a theme color (Catppuccin) so the map follows light and dark mode. */
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888888";
const zoneColor = (kind: "safe" | "attention") => css(kind === "safe" ? "--green" : "--red");

/** Only a plain image data URL may be placed into the marker, whatever the server sent. */
export const safePhoto = (p?: string) => (p && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : "");

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function avatar(initial: string, hot: boolean, photo = "") {
  return L.divIcon({
    className: "avatar-pin",
    html: `<div class="pin ${hot ? "hot" : ""} ${photo ? "photo" : ""}">${photo ? `<img src="${photo}" alt="">` : `<span>${esc(initial)}</span>`}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export function MapView({ zones, trail, last, alert, initial = "A", photo, className = "map", onPick, pick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layer = useRef<L.LayerGroup>();
  const fitted = useRef<string>("");
  /** Re-run the home view when the box changes size, until real data arrives. */
  const refit = useRef<(() => void) | undefined>(undefined);
  const pickHandler = useRef(onPick);
  pickHandler.current = onPick;
  const pickLayer = useRef<L.Marker>();

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, scrollWheelZoom: false }).setView([29.97, -95.69], 14);
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    m.on("click", (e: L.LeafletMouseEvent) => pickHandler.current?.(e.latlng.lat, e.latlng.lng));
    // Leaflet must be told when its box changes size, or it leaves gray bands.
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      refit.current?.();
    });
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const z of zones) {
      L.circle([z.lat, z.lon], { radius: z.radiusM, color: zoneColor(z.kind), weight: 2.5, fillOpacity: 0.16 })
        .bindTooltip(`${z.kind === "safe" ? "Safe" : "Flagged"}: ${z.name}`)
        .addTo(g);
    }
    if (trail.length > 1) {
      L.polyline(trail.map((p) => [p.lat, p.lon] as [number, number]), { color: css("--yellow"), weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(g);
    }
    const sos = alert?.sos;
    if (last && sos?.predicted10Min) {
      L.polyline(
        [
          [last.lat, last.lon],
          [sos.predicted10Min.lat, sos.predicted10Min.lon],
        ],
        { color: css("--red"), weight: 3, dashArray: "1 9", lineCap: "round" },
      )
        .bindTooltip("Where he may be in 10 minutes, if he keeps going")
        .addTo(g);
    }
    if (last) {
      const hot = !!alert && alert.status === "open";
      L.marker([last.lat, last.lon], { icon: avatar(initial, hot, safePhoto(photo)), keyboard: false }).bindTooltip("Last known position").addTo(g);
    }

    // Fit once per alert / first data, otherwise keep the child in view. With no data yet, show home.
    const key = alert?.id ?? (last ? "first" : "none");
    if (fitted.current !== key) {
      fitted.current = key;
      if (last) {
        const pts = trail.length > 1 ? trail.map((p) => [p.lat, p.lon] as [number, number]) : [[last.lat, last.lon] as [number, number]];
        if (sos?.predicted10Min) pts.push([sos.predicted10Min.lat, sos.predicted10Min.lon]);
        m.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
        refit.current = undefined;
      } else if (zones.length) {
        const home = () => {
          m.invalidateSize();
          m.fitBounds(L.latLngBounds(zones.filter((z) => z.kind === "safe").map((z) => [z.lat, z.lon] as [number, number])).pad(0.5), { maxZoom: 14, animate: false });
        };
        refit.current = home;
        home();
      }
    } else if (last && !m.getBounds().contains([last.lat, last.lon])) {
      m.panTo([last.lat, last.lon]);
    }
  }, [zones, trail, last, alert, initial, photo]);

  // The pin for a spot the parent has picked.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pickLayer.current?.remove();
    pickLayer.current = undefined;
    if (pick) {
      pickLayer.current = L.marker([pick.lat, pick.lon], { icon: avatar("+", false), keyboard: false }).addTo(m);
      if (!m.getBounds().contains([pick.lat, pick.lon])) m.panTo([pick.lat, pick.lon]);
    }
  }, [pick?.lat, pick?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={className} ref={el} role="img" aria-label="Map showing where the child was last seen" />;
}
