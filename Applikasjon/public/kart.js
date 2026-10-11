// Kartskissen over Solbakken. Tegnes som SVG i meter (x mot øst, y mot sør) fra data/kart.json.
// Kartet viser hva søknaden og kontrollen peker på. Det avgjør ingenting selv.

const NS = "http://www.w3.org/2000/svg";

function s(tag, attr = {}, ...barn) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attr)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  e.append(...barn);
  return e;
}

const midt = (r) => ({ x: r.x + r.b / 2, y: r.y + r.d / 2 });

/**
 * @param {HTMLElement} beholder
 * @param {{ kart: any, matrikkel: any, planregister: any }} data
 * @param {{ vedKlikk: (id: string) => void }} valg
 */
export function lagKart(beholder, data, { vedKlikk }) {
  const { kart } = data;
  const tomter = new Map(kart.eiendommer.map((e) => [e.id, e]));
  const svg = s("svg", { viewBox: "-8 -33 182 72", role: "img", "aria-label": "Kartskisse over Solbakken" });
  const bunn = s("g");
  const lagTomter = s("g");
  const lagBygg = s("g");
  const lagTiltak = s("g");
  const lagGrenser = s("g");
  const lagLinjer = s("g");
  const lagMerker = s("g");
  svg.append(bunn, lagTomter, lagBygg, lagTiltak, lagGrenser, lagLinjer, lagMerker);
  beholder.replaceChildren(svg);

  for (const v of kart.veier) {
    bunn.append(
      s("rect", { x: v.x, y: v.y, width: v.b, height: v.d, class: "k-vei", rx: 0.5 }),
      s("line", { x1: v.x, x2: v.x + v.b, y1: v.y + v.d / 2, y2: v.y + v.d / 2, class: "k-midtlinje" }),
      s("text", { x: v.x + v.b - 4, y: v.y + v.d / 2 + 0.9, class: "k-veinavn", "text-anchor": "end" }, v.navn.toUpperCase()),
    );
  }

  const tomtEl = new Map();
  for (const t of kart.eiendommer) {
    const r = s("rect", { x: t.x, y: t.y, width: t.b, height: t.d, class: `k-tomt${t.utenforMatrikkel ? " utenfor" : ""}` });
    r.addEventListener("click", () => vedKlikk(t.id));
    r.append(s("title", {}, `${t.id} · ${adresse(t.id)}`));
    tomtEl.set(t.id, r);
    lagTomter.append(r);
    const ty = t.y >= 0 ? t.y + t.d - 1.4 : t.y + 3;
    lagTomter.append(
      s("text", { x: t.x + t.b / 2, y: ty, class: "k-etikett" },
        s("tspan", { class: "nr" }, adresse(t.id)), s("tspan", { class: "liten", dx: 1.2 }, t.id)),
    );
  }
  for (const b of kart.bygninger) {
    lagBygg.append(s("rect", { x: b.x, y: b.y, width: b.b, height: b.d, class: "k-bygg", rx: 0.3 }));
  }
  for (const [x, y] of kart.traer) {
    lagBygg.append(s("circle", { cx: x, cy: y, r: 2, class: "k-tre" }), s("circle", { cx: x - 0.5, cy: y - 0.6, r: 1.2, class: "k-tre2" }));
  }

  function matrikkelEiendom(id) {
    const [gnr, bnr] = id.split("/").map(Number);
    return data.matrikkel.eiendommer.find((e) => e.gnr === gnr && e.bnr === bnr) ?? null;
  }

  function adresse(id) {
    const m = matrikkelEiendom(id);
    return m?.adresser[0]?.adresse ?? tomter.get(id)?.adresse ?? id;
  }

  function finnesPaKart(id) {
    return tomter.has(id);
  }

  function naboer(id) {
    const t = tomter.get(id);
    if (!t) return [];
    return kart.eiendommer.filter((n) => {
      if (n.id === id) return false;
      if (n.y === t.y) return n.x + n.b === t.x || t.x + t.b === n.x;
      const overlapp = Math.min(n.x + n.b, t.x + t.b) - Math.max(n.x, t.x);
      return overlapp > 2;
    }).map((n) => n.id);
  }

  function merk(id, klasse) {
    tomtEl.get(id)?.classList.add(klasse);
  }

  function fjern(klasse) {
    for (const r of tomtEl.values()) r.classList.remove(klasse);
  }

  function puls(id) {
    const r = tomtEl.get(id);
    if (!r) return;
    r.classList.remove("puls");
    void r.getBoundingClientRect();
    r.classList.add("puls");
  }

  function velg(id) {
    fjern("valgt");
    beholder.classList.toggle("dempet", Boolean(id));
    if (id) {
      merk(id, "valgt");
      puls(id);
    }
  }

  // Merkelapp over en eiendom eller et punkt. Flere merkelapper på samme eiendom stables oppover.
  const stabel = new Map();
  function merkelapp(id, tekst, klasse = "", { x, y, nokkel } = {}) {
    const t = tomter.get(id);
    if (!t && x === undefined) return null;
    // En merkelapp med samme nøkkel byttes ut på samme plass.
    const plasser = stabel.get(id) ?? [];
    stabel.set(id, plasser);
    const gammel = nokkel ? lagMerker.querySelector(`[data-nokkel="${nokkel}"]`) : null;
    gammel?.remove();
    let n = nokkel ? plasser.indexOf(nokkel) : -1;
    if (n < 0) n = plasser.push(nokkel ?? Symbol()) - 1;
    const cx = x ?? t.x + t.b / 2;
    // Under tomta for eiendommene sør for veien, over tomta for dem nord for veien.
    const cy = y ?? (t.y >= 0 ? t.y + t.d + 2.4 + n * 3.9 : t.y - 2.2 - n * 3.9);
    const bredde = tekst.length * 1.12 + 3;
    const g = s("g", { class: `k-merkelapp ${klasse}`, "data-nokkel": nokkel },
      s("rect", { x: cx - bredde / 2, y: cy - 1.7, width: bredde, height: 3.4, rx: 1.7 }),
      s("text", { x: cx, y: cy + 0.1 }, tekst),
    );
    lagMerker.append(g);
    return g;
  }

  function merke(id, tegn, farge) {
    const t = tomter.get(id);
    if (!t) return;
    const cx = t.x + t.b - 2.6;
    const cy = t.y + 2.6;
    lagMerker.querySelector(`[data-merke="${id}"]`)?.remove();
    lagMerker.append(
      s("g", { class: "k-merke", "data-merke": id },
        s("circle", { cx, cy, r: 2.1, fill: farge }),
        s("text", { x: cx, y: cy + 0.1 }, tegn),
      ),
    );
  }

  function konflikt(a, b, tekst) {
    const ta = tomter.get(a);
    const tb = tomter.get(b);
    if (!ta || !tb) return;
    const pa = midt(ta);
    const pb = midt(tb);
    const bue = `M${pa.x},${pa.y} Q${(pa.x + pb.x) / 2},${Math.min(pa.y, pb.y) - 14} ${pb.x},${pb.y}`;
    lagLinjer.append(s("path", { d: bue, class: "k-konflikt", fill: "none" }));
    merkelapp(null, tekst, "feil", { x: (pa.x + pb.x) / 2, y: Math.min(pa.y, pb.y) - 7.5 });
  }

  function brev() {
    return s("g", { class: "k-brev" },
      s("rect", { x: -2.2, y: -1.5, width: 4.4, height: 3, rx: 0.3 }),
      s("path", { d: "M-2.2,-1.5 L0,0.4 L2.2,-1.5" }),
    );
  }

  // Brev flyr fra søkers eiendom til hver mottaker. Deretter får mottakeren et merke.
  function sendNabovarsel(fra, mottakere) {
    const tf = tomter.get(fra);
    if (!tf) return;
    const p0 = midt(tf);
    mottakere.forEach((m, i) => {
      const tm = tomter.get(m.eiendom);
      if (!tm) return;
      const p1 = midt(tm);
      if (!m.varslet) {
        setTimeout(() => merke(m.eiendom, "?", "#d97706"), 300 + i * 220);
        return;
      }
      const b = brev();
      lagMerker.append(b);
      const anim = b.animate(
        [
          { transform: `translate(${p0.x}px, ${p0.y}px) scale(.6)`, opacity: 0 },
          { transform: `translate(${(p0.x + p1.x) / 2}px, ${Math.min(p0.y, p1.y) - 9}px) scale(1.2)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${p1.x}px, ${p1.y}px) scale(1)`, opacity: 1 },
        ],
        { duration: 1100, delay: i * 260, easing: "ease-in-out", fill: "both" },
      );
      anim.onfinish = () => {
        b.remove();
        merke(m.eiendom, "✓", "#16a34a");
        puls(m.eiendom);
      };
    });
  }

  function byggegrenser(id, plan) {
    const t = tomter.get(id);
    const g = plan?.byggegrense;
    if (!t || !g) return;
    lagGrenser.replaceChildren();
    const x0 = t.x + g.ovrige;
    const x1 = t.x + t.b - g.ovrige;
    const y0 = t.y + g.motVei;
    const y1 = t.y + t.d - g.ovrige;
    lagGrenser.append(
      s("path", { d: `M${x0},${y0} H${x1} V${y1} H${x0} Z`, class: "k-grense" }),
      s("text", { x: x1 - 0.6, y: y0 - 0.7, class: "k-etikett liten", "text-anchor": "end", fill: "#b91c1c" }, `byggegrense ${String(g.motVei).replace(".", ",")} m mot vei`),
    );
  }

  let tiltakEl = null;
  function tegnTiltak(tiltak) {
    lagTiltak.replaceChildren();
    tiltakEl = null;
    if (!tiltak) return;
    tiltakEl = s("rect", {
      x: tiltak.x, y: tiltak.y, width: tiltak.b, height: tiltak.d, rx: 0.2,
      class: `k-tiltak${tiltak.usikker ? " usikker" : ""}`,
    });
    lagTiltak.append(tiltakEl);
  }

  function tiltakStatus(status) {
    if (!tiltakEl) return;
    tiltakEl.classList.remove("ok", "avvik");
    if (status) tiltakEl.classList.add(status);
  }

  function nullstill() {
    for (const lag of [lagGrenser, lagLinjer, lagMerker]) lag.replaceChildren();
    stabel.clear();
    for (const k of ["soker", "oppgitt", "bekreftet", "avvik", "valgt", "puls"]) fjern(k);
    beholder.classList.remove("dempet");
    tiltakStatus(null);
  }

  return {
    nullstill, merk, fjern, puls, velg, merkelapp, merke, konflikt, sendNabovarsel,
    byggegrenser, tegnTiltak, tiltakStatus, naboer, adresse, matrikkelEiendom, finnesPaKart,
    tomt: (id) => tomter.get(id),
  };
}
