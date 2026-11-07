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

// A solid plate behind each group's text, so it reads on any fill. Each group has to be on the page already, to be measured.
export function addPlates(groups, padX = 4, padY = 2) {
  groups.insert("rect", ":first-child").attr("class", "plate").attr("rx", 3).each(function () {
    const { x, y, width, height } = this.parentNode.getBBox();
    this.setAttribute("x", x - padX);
    this.setAttribute("y", y - padY);
    this.setAttribute("width", width + 2 * padX);
    this.setAttribute("height", height + 2 * padY);
  });
}

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
// A mouse hovers, then clicks. A finger can't hover, so its first tap on a mark stands in for the hover and a second tap on
// the same mark for the click. A drag only scrolls. `over` and `out` go with the tooltip, and `act` is the click.
let lastPointer = "mouse";
let held = null;
export function withTip(selection, contentOf, { over, out, act } = {}) {
  const show = (event, d) => { over?.(d); showTip(event, ...contentOf(d)); };
  const hide = () => { out?.(); hideTip(); };
  selection
    .on("pointerenter", (event, d) => { if (event.pointerType === "mouse") show(event, d); })
    .on("pointermove", (event, d) => { if (event.pointerType === "mouse") showTip(event, ...contentOf(d)); })
    .on("pointerleave", (event) => { if (event.pointerType === "mouse") hide(); })
    .on("click", function (event, d) {
      if (lastPointer === "mouse") { act?.(d); return; }
      const again = held?.node === this;
      letGo();
      if (again) { act?.(d); return; }
      show(event, d);
      held = { node: this, hide };
    });
}
function letGo() {
  held?.hide();
  held = null;
}
// A tap elsewhere or a scroll puts away what a tap showed. A click doesn't always say what kind of pointer made it, so this notes that.
export function watchPointers() {
  addEventListener("pointerdown", (event) => {
    lastPointer = event.pointerType;
    if (held && !held.node.contains(event.target)) letGo();
  }, true);
  addEventListener("scroll", () => { hideTip(); letGo(); }, { passive: true });
}
