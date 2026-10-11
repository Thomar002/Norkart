import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

// Gjør SVG-kildene i tegninger/ om til PNG, slik at AI-en kan lese dem som bilder.
// tegninger/plankart.svg -> data/plankart.png
// tegninger/<sak>/<navn>.svg -> data/saker/<sak>/<navn>.png
const mappe = path.dirname(fileURLToPath(import.meta.url));
const kilder = path.join(mappe, "tegninger");

const ut = [[path.join(kilder, "plankart.svg"), path.join(mappe, "data", "plankart.png")]];
for (const sak of await fs.readdir(kilder, { withFileTypes: true })) {
  if (!sak.isDirectory()) continue;
  for (const fil of await fs.readdir(path.join(kilder, sak.name))) {
    if (!fil.endsWith(".svg")) continue;
    ut.push([
      path.join(kilder, sak.name, fil),
      path.join(mappe, "data", "saker", sak.name, fil.replace(/\.svg$/, ".png")),
    ]);
  }
}

for (const [kilde, mal] of ut) {
  const svg = await fs.readFile(kilde);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  await fs.writeFile(mal, png);
  console.log(`${path.relative(mappe, kilde)} -> ${path.relative(mappe, mal)}`);
}
