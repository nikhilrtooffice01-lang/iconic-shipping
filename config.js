// Frontend aur backend ek hi domain par ho to API_BASE khali rakho (recommended).
// Alag domain par ho to e.g. "https://api.yourdomain.com"
window.API_BASE = "";
const API = window.API_BASE;
const _fetch = window.fetch.bind(window);
window.fetch = (u, o = {}) => (typeof u === "string" && u.startsWith("/api"))
  ? _fetch(API + u, { credentials: "include", ...o }) : _fetch(u, o);
