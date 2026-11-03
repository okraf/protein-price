// Met à jour data/products.json à partir de data/catalog.json, via un navigateur piloté par OpenCLI.
//   node scripts/update.mjs                      tous les produits
//   node scripts/update.mjs --only skyr,oeufs    seulement certains produits
//   node scripts/update.mjs --profile <id>       navigateur OpenCLI précis (voir `opencli profile list`)
// Un produit peut être relevé dans un autre magasin que celui de son enseigne (champ "store" du catalogue).
// Un produit en échec garde ses dernières données. Code de sortie 1 si aucun produit n'a pu être lu.
import { readFile, writeFile } from "node:fs/promises";
import { sources } from "../sources/index.mjs";
import { createTransport } from "./transports.mjs";

const root = new URL("../", import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const only = arg("only", "")?.split(",").filter(Boolean);
const profile = arg("profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catalog = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
let previous = { products: [] };
try { previous = JSON.parse(await readFile(new URL("data/products.json", root), "utf8")); } catch {}
const previousById = new Map(previous.products.map((p) => [p.id, p]));

const results = [];
let ok = 0, failed = 0;

for (const [sourceId, store] of Object.entries(catalog.stores)) {
  const source = sources[sourceId];
  if (!source) throw new Error(`Source inconnue dans le catalogue : ${sourceId}`);
  const entries = catalog.products.filter((e) => e.source === sourceId);
  const todo = entries.filter((e) => !only.length || only.includes(e.id));
  if (!todo.length) continue;

  const transport = createTransport({ profile });
  let currentStore = null;

  for (const entry of todo) {
    const entryStore = entry.store ?? store;
    try {
      if (currentStore?.ref !== entryStore.ref) {
        await source.selectStore(transport, entryStore);
        currentStore = entryStore;
      }
      const product = await source.fetchProduct(transport, entry, entryStore);
      // Une fiche à 0 g de protéines est une erreur de saisie de l'enseigne (vu sur des lentilles).
      if (!(product.nutrition.protein > 0)) throw new Error("protéines absentes ou nulles sur la fiche");
      if (product.available && !(product.pricePerKg > 0)) throw new Error("prix au kilo introuvable");
      results.push(product);
      ok++;
      console.log(`ok    ${entry.id.padEnd(22)} ${product.price ?? "–"} € · ${product.pricePerKg ?? "–"} €/kg · ${product.nutrition.protein} g prot.`);
    } catch (err) {
      failed++;
      console.error(`échec ${entry.id.padEnd(22)} ${err.message}`);
    }
    // Rythme lent et irrégulier (20 à 40 s) : au-delà, l'anti-bot d'Intermarché bannit l'IP.
    await sleep(20000 + Math.random() * 20000);
  }
  await transport.close();
}

if (!ok) {
  console.error(`Aucun produit lu (${failed} échecs) : data/products.json inchangé.`);
  process.exit(1);
}

// Fusion : nouvelles données, sinon dernières données connues, dans l'ordre du catalogue.
const fresh = new Map(results.map((p) => [p.id, p]));
const products = catalog.products
  .map((e) => fresh.get(e.id) ?? (previousById.get(e.id)?.url === e.url ? previousById.get(e.id) : null))
  .filter(Boolean);

const output = {
  generatedAt: new Date().toISOString(),
  sources: Object.fromEntries(Object.entries(catalog.stores).map(([sid, store]) => [sid, {
    label: sources[sid].label,
    url: sources[sid].homepage,
    store,
  }])),
  products,
};
await writeFile(new URL("data/products.json", root), JSON.stringify(output, null, 2) + "\n");
console.log(`${ok} produits mis à jour, ${failed} en échec, ${products.length} dans le classement.`);
