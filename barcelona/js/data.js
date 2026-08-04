const cache = new Map();

async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const json = await res.json();
  cache.set(path, json);
  return json;
}

export function loadManifest() {
  return fetchJson("data/manifest.json");
}

export function loadSeason(id) {
  return fetchJson(`data/seasons/${id}.json`);
}

export function loadSearchIndex() {
  return fetchJson("data/search-index.json");
}
