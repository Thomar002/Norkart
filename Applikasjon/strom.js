// Leser JSON etter hvert som modellen skriver den, og melder fra så snart noe er klart.
// Brukes til å vise kontrollpunktene ett for ett mens svaret strømmer inn.
// vedVerdi: hver ferdig verdi ned til tre nivåer, f.eks. ["kategori"], ["punkter", 3] og ["punkter", 3, "id"].
// vedDelvis: tekst som fortsatt skrives, med det som er skrevet så langt, f.eks. ["punkter", 3, "vurdering"].

const MAKS_DYBDE = 3;

export class JsonStrom {
  /**
   * @param {(sti: (string|number)[], verdi: unknown) => void} vedVerdi
   * @param {{ vedDelvis?: (sti: (string|number)[], tekst: string) => void }} [valg]
   */
  constructor(vedVerdi, { vedDelvis } = {}) {
    this.vedVerdi = vedVerdi;
    this.vedDelvis = vedDelvis;
    this.tekst = "";
    this.pos = 0;
    /** @type {{ type: "obj"|"arr", sti: (string|number)[], start: number, nokkel: string|null, venterNokkel: boolean, indeks: number }[]} */
    this.stabel = [];
    this.streng = null; // { start, erNokkel, sti }
    this.escape = false;
    this.skalar = null; // { start, sti }
  }

  /** @param {string} bit */
  mat(bit) {
    this.tekst += bit;
    for (; this.pos < this.tekst.length; this.pos++) this.#tegn(this.tekst[this.pos], this.pos);
    const s = this.streng;
    if (this.vedDelvis && s && !s.erNokkel && s.sti.length <= MAKS_DYBDE) {
      const delvis = delvisStreng(this.tekst.slice(s.start + 1));
      if (delvis !== null) this.vedDelvis(s.sti, delvis);
    }
  }

  #verdiSti() {
    const f = this.stabel.at(-1);
    if (!f) return [];
    return f.type === "obj" ? [...f.sti, f.nokkel] : [...f.sti, f.indeks];
  }

  #ferdig(sti, start, slutt) {
    if (sti.length >= 1 && sti.length <= MAKS_DYBDE) this.vedVerdi(sti, JSON.parse(this.tekst.slice(start, slutt)));
  }

  #avsluttSkalar(i) {
    if (!this.skalar) return;
    this.#ferdig(this.skalar.sti, this.skalar.start, i);
    this.skalar = null;
  }

  #tegn(c, i) {
    if (this.streng) {
      if (this.escape) this.escape = false;
      else if (c === "\\") this.escape = true;
      else if (c === '"') {
        const s = this.streng;
        this.streng = null;
        if (s.erNokkel) this.stabel.at(-1).nokkel = JSON.parse(this.tekst.slice(s.start, i + 1));
        else this.#ferdig(s.sti, s.start, i + 1);
      }
      return;
    }
    const f = this.stabel.at(-1);
    switch (c) {
      case "{":
      case "[":
        this.stabel.push({ type: c === "{" ? "obj" : "arr", sti: this.#verdiSti(), start: i, nokkel: null, venterNokkel: true, indeks: 0 });
        return;
      case "}":
      case "]": {
        this.#avsluttSkalar(i);
        const lukket = this.stabel.pop();
        if (lukket) this.#ferdig(lukket.sti, lukket.start, i + 1);
        return;
      }
      case '"':
        if (f?.type === "obj" && f.venterNokkel) this.streng = { start: i, erNokkel: true };
        else this.streng = { start: i, erNokkel: false, sti: this.#verdiSti() };
        return;
      case ":":
        if (f?.type === "obj") f.venterNokkel = false;
        return;
      case ",":
        this.#avsluttSkalar(i);
        if (f?.type === "obj") f.venterNokkel = true;
        else if (f) f.indeks++;
        return;
      default:
        if (/\s/.test(c)) this.#avsluttSkalar(i);
        else if (!this.skalar) this.skalar = { start: i, sti: this.#verdiSti() };
    }
  }
}

// Dekoder en JSON-streng som ikke er ferdig skrevet. Et halvt escape-tegn på slutten kuttes bort.
function delvisStreng(raa) {
  for (let kutt = 0; kutt <= 6 && kutt <= raa.length; kutt++) {
    try {
      return JSON.parse(`"${raa.slice(0, raa.length - kutt)}"`);
    } catch {
      // prøv med ett tegn mindre
    }
  }
  return null;
}
