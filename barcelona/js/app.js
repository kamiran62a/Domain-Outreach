import { loadManifest, loadSeason, loadSearchIndex } from "./data.js";
import { renderStatsHeader, renderSeasonList, renderSeasonDetail, renderSearchResults, renderError } from "./render.js";
import { t } from "./i18n.js";

const state = {
  lang: localStorage.getItem("bcn_lang") || "ar",
  query: "",
  competition: "all",
  decade: "all",
  verifiedOnly: false,
  manifest: null,
  searchIndex: null,
};

const els = {
  statsBar: document.getElementById("stats-bar"),
  langToggle: document.getElementById("lang-toggle"),
  searchInput: document.getElementById("search-input"),
  competitionSelect: document.getElementById("competition-select"),
  decadeChips: document.getElementById("decade-chips"),
  verifiedToggle: document.getElementById("verified-toggle"),
  searchResults: document.getElementById("search-results"),
  seasonList: document.getElementById("season-list"),
  detailPanel: document.getElementById("detail-panel"),
  subtitle: document.getElementById("subtitle"),
  footerNote: document.getElementById("footer-note"),
};

function applyLangDom() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  els.langToggle.textContent = t("langToggle", state.lang);
  els.searchInput.placeholder = t("searchPlaceholder", state.lang);
  els.verifiedToggle.textContent = state.verifiedOnly ? t("showAll", state.lang) : t("verifiedOnly", state.lang);
  els.subtitle.textContent = t("subtitle", state.lang);
  els.footerNote.textContent = t("footerNote", state.lang);
  document.title = t("title", state.lang);
  const opt = els.competitionSelect.querySelector('option[value="all"]');
  if (opt) opt.textContent = t("allCompetitions", state.lang);
}

function groupByDecade(seasons) {
  const groups = {};
  for (const s of seasons) {
    (groups[s.decade] = groups[s.decade] || []).push(s);
  }
  return groups;
}

function filteredSeasons() {
  return state.manifest.seasons.filter((s) => {
    if (state.verifiedOnly && s.source !== "verified") return false;
    if (state.decade !== "all" && s.decade !== state.decade) return false;
    if (state.competition !== "all" && !(s.competitions || []).includes(state.competition)) return false;
    return true;
  });
}

function openSeason(id) {
  window.location.hash = `#/season/${id}`;
}

function goBack() {
  window.location.hash = "#/";
}

async function renderListView() {
  els.detailPanel.hidden = true;
  els.detailPanel.innerHTML = "";
  document.getElementById("controls").hidden = false;
  if (state.query) {
    els.seasonList.hidden = true;
    return;
  }
  els.seasonList.hidden = false;
  renderSeasonList(els.seasonList, groupByDecade(filteredSeasons()), state.lang, openSeason);
}

async function renderDetailView(id) {
  document.getElementById("controls").hidden = true;
  els.seasonList.hidden = true;
  els.searchResults.innerHTML = "";
  els.detailPanel.hidden = false;
  try {
    const season = await loadSeason(id);
    renderSeasonDetail(els.detailPanel, season, state.lang, goBack);
  } catch (e) {
    renderError(els.detailPanel, t("notFound", state.lang));
  }
}

async function runSearch() {
  if (!state.query) {
    els.searchResults.innerHTML = "";
    renderListView();
    return;
  }
  if (!state.searchIndex) {
    try {
      state.searchIndex = await loadSearchIndex();
    } catch (e) {
      renderError(els.searchResults, t("loadError", state.lang));
      return;
    }
  }
  const q = state.query.trim().toLowerCase();
  const results = state.searchIndex.filter(
    (m) => (m.home && m.home.toLowerCase().includes(q)) || (m.away && m.away.toLowerCase().includes(q))
  );
  els.seasonList.hidden = true;
  renderSearchResults(els.searchResults, state.query, results, state.lang, openSeason);
}

function populateFilters() {
  const decades = [...new Set(state.manifest.seasons.map((s) => s.decade))].sort();
  els.decadeChips.innerHTML = `<button class="chip active" data-decade="all">${t("showAll", state.lang)}</button>` +
    decades.map((d) => `<button class="chip" data-decade="${d}">${d}</button>`).join("");
  els.decadeChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.decade = chip.dataset.decade;
      els.decadeChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderListView();
    });
  });

  const competitions = [...new Set(state.manifest.seasons.flatMap((s) => s.competitions || []))].sort();
  els.competitionSelect.innerHTML = `<option value="all">${t("allCompetitions", state.lang)}</option>` +
    competitions.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function route() {
  const hash = window.location.hash;
  const m = hash.match(/^#\/season\/(.+)$/);
  if (m) {
    renderDetailView(decodeURIComponent(m[1]));
  } else {
    renderListView();
  }
}

function wireEvents() {
  els.langToggle.addEventListener("click", () => {
    state.lang = state.lang === "ar" ? "en" : "ar";
    localStorage.setItem("bcn_lang", state.lang);
    applyLangDom();
    populateFilters();
    renderStatsHeader(els.statsBar, state.manifest, state.lang);
    route();
  });

  let debounceTimer;
  els.searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const value = e.target.value;
    debounceTimer = setTimeout(() => {
      state.query = value;
      runSearch();
    }, 200);
  });

  els.competitionSelect.addEventListener("change", (e) => {
    state.competition = e.target.value;
    renderListView();
  });

  els.verifiedToggle.addEventListener("click", () => {
    state.verifiedOnly = !state.verifiedOnly;
    els.verifiedToggle.textContent = state.verifiedOnly ? t("showAll", state.lang) : t("verifiedOnly", state.lang);
    renderListView();
  });

  window.addEventListener("hashchange", route);
}

async function init() {
  applyLangDom();
  wireEvents();
  try {
    state.manifest = await loadManifest();
  } catch (e) {
    renderError(els.seasonList, t("loadError", state.lang));
    return;
  }
  renderStatsHeader(els.statsBar, state.manifest, state.lang);
  populateFilters();
  route();
}

init();
