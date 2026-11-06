// Small DOM helpers shared by the page's drawing modules. Names come from the Division's files,
// so they're only ever set as text.
export const $ = (id) => document.getElementById(id);
// Whole numbers: projected rounds have fractions of ballots.
export const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const pct = (n, of, digits = 1) => (of ? `${((n / of) * 100).toFixed(digits)}%` : "–");
export const alaskaTime = (date) => date.toLocaleString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k.startsWith("aria-")) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const child of children) node.append(child);
  return node;
}
export const strong = (text) => el("strong", {}, text);

const tip = () => $("rcv-tip");
export function showTip(event, value, ...lines) {
  const node = tip();
  node.replaceChildren(strong(value), ...lines.map((line) => el("span", {}, line)));
  node.hidden = false;
  const box = node.getBoundingClientRect();
  const x = event.clientX ?? box.left, y = event.clientY ?? box.top;
  node.style.left = `${Math.max(8, Math.min(x + 12, innerWidth - box.width - 8))}px`;
  node.style.top = `${y + box.height + 20 > innerHeight ? Math.max(8, y - box.height - 12) : y + 14}px`;
}
export function hideTip() { tip().hidden = true; }

// Tooltips are for a pointer. Every chart has a table or a picker with the same numbers for the keyboard.
export function withTip(selection, contentOf) {
  selection
    .on("pointerenter pointermove click", (event, d) => showTip(event, ...contentOf(d)))
    .on("pointerleave", hideTip);
}
