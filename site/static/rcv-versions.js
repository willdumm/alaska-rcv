// Earlier versions of the page: one data directory per update from the Division, listed in versions.json, newest first.
// Choosing one reloads the page from that directory, so nothing from another version can stay on screen.
import { $, alaskaTime, el, fmt, strong } from "./rcv-dom.js";

const ROOT = "/data/alaska-rcv-2026/";

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
  const chosen = versions.find((v) => v.id === wanted);
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
  note.textContent = `This runs today's model on what the Division had posted then, so it isn't what this page showed that day. The simulations run 100 times per race, so a close race's count of wins can move several wins between versions by chance alone.${earlier.note ? ` ${earlier.note}` : ""}`;
  note.hidden = false;
}
