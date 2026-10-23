/**
 * Short-lived read-only live-location links for responders. Held in memory only, so a restart revokes them all.
 * The link shows position and movement, nothing else.
 */
import { randomBytes } from "node:crypto";

/** One share link. The token is the only secret in the address. */
export interface Share {
  token: string;
  childId: string;
  createdAt: number; // real ms
  expiresAt: number; // real ms
}

// Links last 2 hours, and at most 5 can be open at once.
const TTL_MS = 2 * 3600_000;
const MAX_ACTIVE = 5;
const shares = new Map<string, Share>();

/** Make a new link. Expired links are cleared first. */
export function createShare(childId: string): Share {
  const now = Date.now();
  for (const [t, s] of shares) if (s.expiresAt <= now) shares.delete(t);
  // Oldest links are dropped first, so a parent cannot leave an unbounded set of open links.
  while (shares.size >= MAX_ACTIVE) shares.delete(shares.keys().next().value as string);
  const s: Share = { token: randomBytes(18).toString("base64url"), childId, createdAt: now, expiresAt: now + TTL_MS };
  shares.set(s.token, s);
  return s;
}

/** The share for a token, or undefined if unknown or expired (expired ones are removed on the spot). */
export function getShare(token: string): Share | undefined {
  const s = shares.get(token);
  if (!s) return undefined;
  if (s.expiresAt <= Date.now()) {
    shares.delete(token);
    return undefined;
  }
  return s;
}

/** Close a link before it expires. True if it existed. */
export function revokeShare(token: string): boolean {
  return shares.delete(token);
}

/** Links that are still open, for the parent to see and revoke. */
export function activeShares(): Share[] {
  const now = Date.now();
  return [...shares.values()].filter((s) => s.expiresAt > now);
}

/** A bare read-only page for a responder: no login, no history beyond 3 hours, nothing but position. */
export const SHARE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Live location</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>body{margin:0;font-family:system-ui,sans-serif}#top{padding:10px 14px;background:#7a1510;color:#fff}#top b{font-size:17px}
#info{padding:8px 14px;font-size:14px;line-height:1.4}#map{height:62vh}small{opacity:.75}</style></head>
<body><div id="top"><b id="name">Loading</b><br><small id="sub"></small></div><div id="info"></div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map').setView([0,0],2),line,dot,fitted=false;
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
function ago(ms){var m=Math.round(ms/60000);return m<1?'just now':m+' min ago';}
function load(){fetch(location.pathname+'/data',{cache:'no-store'}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(d){
document.getElementById('name').textContent=d.child.name+', age '+d.child.age;
document.getElementById('sub').textContent='Shared by the parent. Expires '+new Date(d.expiresAt).toLocaleTimeString();
var h='';if(d.child.description)h+='<div><b>Description:</b> '+esc(d.child.description)+'</div>';
if(d.child.medical)h+='<div><b>Medical:</b> '+esc(d.child.medical)+'</div>';
if(d.position){h+='<div><b>Last position:</b> '+d.position.lat.toFixed(5)+', '+d.position.lon.toFixed(5)+' ('+ago(d.now-d.position.ts)+')</div>';
h+='<div><b>Movement:</b> '+(d.speedKmh>1?d.speedKmh+' km/h'+(d.compass?' heading '+d.compass:''):'not moving')+'</div>';}
else h+='<div>No position yet.</div>';
h+='<div><small>Automated tracking data. It may be out of date and has not been confirmed.</small></div>';
document.getElementById('info').innerHTML=h;
var pts=d.trail.map(function(p){return [p.lat,p.lon];});
if(line)map.removeLayer(line);if(dot)map.removeLayer(dot);
if(pts.length>1)line=L.polyline(pts,{color:'#2563eb',weight:4}).addTo(map);
if(d.position){dot=L.circleMarker([d.position.lat,d.position.lon],{radius:9,color:'#fff',weight:3,fillColor:'#c8261f',fillOpacity:1}).addTo(map);
if(!fitted){map.setView([d.position.lat,d.position.lon],15);fitted=true;}}
}).catch(function(){document.getElementById('name').textContent='This link has expired or was revoked';document.getElementById('info').textContent='';});}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
load();setInterval(load,5000);
</script></body></html>`;
