import { t } from "./i18n.js";

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function renderStatsHeader(el, manifest, lang) {
  const seasons = manifest.seasons;
  let totalMatches = 0, wins = 0, trophies = 0;
  for (const s of seasons) {
    totalMatches += s.match_count || 0;
    if (typeof s.won === "number") wins += s.won;
    if (Array.isArray(s.trophies)) trophies += s.trophies.length;
  }
  el.innerHTML = `
    <div class="stat-tile"><div class="num">${seasons.length}</div><div class="label">${esc(t("seasons", lang))}</div></div>
    <div class="stat-tile"><div class="num">${totalMatches}</div><div class="label">${esc(t("matches", lang))}</div></div>
    <div class="stat-tile"><div class="num">${wins}</div><div class="label">${esc(t("wins", lang))}</div></div>
    <div class="stat-tile"><div class="num">${trophies}</div><div class="label">${esc(t("trophies", lang))}</div></div>
  `;
}

function badge(source, lang) {
  const cls = source === "verified" ? "verified" : "reconstructed";
  const label = source === "verified" ? t("verifiedBadge", lang) : t("reconstructedBadge", lang);
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

export function renderSeasonList(el, seasonsByDecade, lang, onOpen) {
  el.innerHTML = "";
  const decades = Object.keys(seasonsByDecade).sort();
  for (const decade of decades) {
    const seasons = seasonsByDecade[decade];
    if (!seasons.length) continue;
    const details = document.createElement("details");
    details.className = "decade-group";
    details.open = decade === decades[decades.length - 1];
    const summary = document.createElement("summary");
    summary.textContent = `${decade} (${seasons.length})`;
    details.appendChild(summary);
    const grid = document.createElement("div");
    grid.className = "season-grid";
    for (const s of seasons) {
      const card = document.createElement("div");
      card.className = "season-card";
      const label = lang === "ar" ? s.label_ar : s.label_en;
      const record = (typeof s.played === "number")
        ? `${t("played", lang)} ${s.played} · ${t("won", lang)} ${s.won} · ${t("drawn", lang)} ${s.drawn} · ${t("lost", lang)} ${s.lost}`
        : `${s.match_count || 0} ${t("matches", lang)}`;
      const trophyLine = (s.trophies && s.trophies.length)
        ? `🏆 ${s.trophies.join(" · ")}` : "";
      card.innerHTML = `
        <div class="row1"><span class="label">${esc(label)}</span>${badge(s.source, lang)}</div>
        <div class="meta">${esc(s.competitions ? s.competitions.join(", ") : "")}</div>
        <div class="meta">${esc(record)}</div>
        <div class="trophies">${esc(trophyLine)}</div>
      `;
      card.addEventListener("click", () => onOpen(s.id));
      grid.appendChild(card);
    }
    details.appendChild(grid);
    el.appendChild(details);
  }
  if (!el.children.length) {
    el.innerHTML = `<div class="empty-state">${esc(t("noSearchResults", lang))}</div>`;
  }
}

function matchRow(m, lang) {
  const home = esc(m.home || "?");
  const away = esc(m.away || "?");
  const score = m.score ? esc(m.score) : "—";
  const notable = m.is_notable ? " notable" : "";
  const notes = m.notes ? `<div class="match-notes">${esc(m.notes)}</div>` : "";
  return `
    <div class="match-row${notable}">
      <div class="match-date" dir="ltr">${esc(m.date || "")}</div>
      <div class="match-competition" dir="ltr">${esc(m.competition || "")}${m.round ? " · " + esc(m.round) : ""}</div>
      <div class="match-teams" dir="ltr">${home} <span class="match-score">${score}</span> ${away}</div>
      ${notes}
    </div>
  `;
}

export function renderSeasonDetail(el, season, lang, onBack) {
  const label = lang === "ar" ? season.label_ar : season.label_en;
  const disclaimer = lang === "ar" ? season.disclaimer_ar : season.disclaimer_en;
  const s = season.summary || {};
  const recordLine = (typeof s.played === "number")
    ? `${t("played", lang)} ${s.played} · ${t("won", lang)} ${s.won} · ${t("drawn", lang)} ${s.drawn} · ${t("lost", lang)} ${s.lost} · ${t("goalsFor", lang)} ${s.goals_for} · ${t("goalsAgainst", lang)} ${s.goals_against}`
    : "";
  el.innerHTML = `
    <div class="back-link">${esc(t("back", lang))}</div>
    <div class="detail-header">
      <div>
        <h2 style="margin:0 0 4px;">${esc(label)}</h2>
        <div class="meta" style="color:var(--text-muted);font-size:0.85rem;">${esc((s.competitions || []).join(", "))}</div>
      </div>
      ${badge(season.source, lang)}
    </div>
    ${disclaimer ? `<div class="disclaimer-banner">${esc(disclaimer)}</div>` : ""}
    ${recordLine ? `<div class="meta" style="margin-bottom:10px;">${esc(recordLine)}</div>` : ""}
    ${(s.trophies && s.trophies.length) ? `<div style="margin-bottom:14px;">🏆 ${esc(s.trophies.join(" · "))}</div>` : ""}
    <div class="matches-list">
      ${(season.matches && season.matches.length)
        ? season.matches.map((m) => matchRow(m, lang)).join("")
        : `<div class="empty-state">${esc(t("noMatches", lang))}</div>`}
    </div>
  `;
  el.querySelector(".back-link").addEventListener("click", onBack);
}

export function renderSearchResults(el, query, results, lang, onOpenSeason) {
  if (!query) {
    el.innerHTML = "";
    return;
  }
  if (!results.length) {
    el.innerHTML = `<div class="empty-state">${esc(t("noSearchResults", lang))}</div>`;
    return;
  }
  el.innerHTML = `<h3 style="margin:0 0 8px;font-size:0.95rem;">${esc(t("searchResultsFor", lang))} "${esc(query)}" (${results.length})</h3>` +
    `<div class="detail-panel">` +
    results.slice(0, 100).map((m) => matchRow(m, lang)).join("") +
    `</div>`;
  el.querySelectorAll(".match-row").forEach((row, i) => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => onOpenSeason(results[i].season_id));
  });
}

export function renderError(el, message) {
  el.innerHTML = `<div class="error-banner">${esc(message)}</div>`;
}
