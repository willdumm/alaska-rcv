// Earlier versions of the page: one data directory per update from the Division, listed in versions.json, newest first.
// Choosing one reloads the page from that directory, so nothing from another version can stay on screen.
import { $, alaskaTime, el, fmt, strong } from "./rcv-dom.js";

const ROOT = "/data/alaska-rcv-2026/";

// Before November 10, 2026, a version was named for its time alone, such as 2026-11-07T203800Z, and links still use those names.
// Two versions can share a time, and only the first of them had that name, so the oldest wins.
export function oldName(versions, wanted) {
  return versions.findLast((v) => v.time.replaceAll(":", "") === wanted);
}

// `wanted` comes from the URL, so it's only used if it's in the list. Without the list, the page still works, on the newest data.
export async function chooseVersion(wanted) {
  let versions = [];
  try {
    const response = await fetch(`${ROOT}versions.json`);
    if (!response.ok) throw new Error(String(response.status));
    ({ versions } = await response.json());
  } catch (error) {
    console.warn(`versions.json: ${error.message}`);
  }
  const chosen = versions.find((v) => v.id === wanted) ?? oldName(versions, wanted);
  const earlier = chosen && chosen !== versions[0] ? chosen : null;
  return { versions, earlier, missing: Boolean(wanted && !chosen), dir: earlier ? `${ROOT}versions/${earlier.id}/` : ROOT };
}

function goTo(id, latest) {
  const q = new URLSearchParams(location.search);
  if (id === latest) q.delete("version");
  else q.set("version", id);
  const text = q.toString();
  location.assign(`${text ? `?${text}` : location.pathname}${location.hash}`);
}

const optionLabel = (v, i) => `${alaskaTime(new Date(v.time))}: ${fmt(v.counted)} counted, ${fmt(v.received)} on the received table${i === 0 ? " (latest)" : ""}`;

export function renderVersions({ versions, earlier, missing }) {
  const note = $("rcv-version-note");
  if (missing) {
    note.textContent = "That version wasn't found, so this is the latest.";
    note.hidden = false;
  }
  if (versions.length < 2) return;
  const latest = versions[0].id;
  const select = $("f-version");
  select.replaceChildren(...versions.map((v, i) => el("option", { value: v.id }, optionLabel(v, i))));
  select.value = earlier?.id ?? latest;
  select.addEventListener("change", () => goTo(select.value, latest));
  $("rcv-version-picker").hidden = false;
  if (!earlier) return;

  const warning = $("rcv-version-warning");
  warning.replaceChildren(strong(`Earlier version: the Division's data as of ${alaskaTime(new Date(earlier.time))}. `),
    el("button", { type: "button", class: "rcv-reset", onclick: () => goTo(latest, latest) }, "Back to the latest"));
  warning.hidden = false;
  note.textContent = `This runs today's model on what the Division had posted then, so it isn't what this page showed that day. The simulations run 1,000 times per race, so a close race's wins can move by about 16 of 1,000 between versions by chance alone.${earlier.note ? ` ${earlier.note}` : ""}`;
  note.hidden = false;
}

// A deploy with new data puts a new version at the top of versions.json, so an open tab checks it every few minutes, and when
// it comes back into view. A reader on the latest version who isn't looking gets the new data by a reload, which keeps the URL
// and the scroll position. One who is reading, or who chose an earlier version, is told instead, so nothing moves under them.
const CHECK_EVERY = 5 * 60 * 1000;
const CHECK_AGAIN_AFTER = 60 * 1000;

export function watchForNewer({ versions, earlier }) {
  const loaded = versions[0]?.id;
  if (!loaded) return;
  let newer = false;
  let checked = Date.now();
  const act = (returning) => {
    if (!earlier && (returning || document.hidden)) location.reload();
    else showNewer(earlier);
  };
  const check = async (returning) => {
    checked = Date.now();
    try {
      const response = await fetch(`${ROOT}versions.json`, { cache: "no-cache" });
      if (!response.ok) return;
      const newest = (await response.json()).versions?.[0]?.id;
      newer = Boolean(newest) && newest !== loaded;
    } catch {
      return;
    }
    if (newer) act(returning);
  };
  setInterval(() => { if (!newer) check(false); }, CHECK_EVERY);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (newer) act(true);
    else if (Date.now() - checked > CHECK_AGAIN_AFTER) check(true);
  });
}

function showNewer(earlier) {
  if (earlier) {
    const warning = $("rcv-version-warning");
    if (!warning.querySelector(".rcv-newer")) warning.lastChild.before(el("span", { class: "rcv-newer" }, "Newer results have been posted since. "));
    return;
  }
  const notice = $("rcv-newer-notice");
  notice.replaceChildren(strong("New results posted. "), el("button", { type: "button", class: "rcv-reset", onclick: () => location.reload() }, "Show them"));
  notice.hidden = false;
}
