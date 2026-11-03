// Source Intermarché : lit une fiche produit intermarche.com (prix du magasin choisi,
// valeurs nutritionnelles, composition, textes marketing).
import { parseHTML } from "linkedom";

export const id = "intermarche";
export const label = "Intermarché";
export const homepage = "https://www.intermarche.com";

// Le magasin est porté par le cookie itm_pdv, lu par le site côté navigateur.
function storeCookie(store) {
  return JSON.stringify({ ref: store.ref, isEcommerce: true, name: encodeURIComponent(store.name), city: store.city });
}

// Choisit le magasin dont on veut les prix (à rappeler à chaque changement de magasin).
export async function selectStore(transport, store) {
  await transport.open(homepage);
  const value = encodeURIComponent(storeCookie(store));
  // Le site pose son propre cookie sur .intermarche.com : on l'efface puis on écrit au même domaine.
  await transport.eval(`document.cookie = "itm_pdv=; path=/; max-age=0"; document.cookie = "itm_pdv=${value}; path=/; domain=.intermarche.com; max-age=31536000"; "ok"`);
}

export async function fetchProduct(transport, entry, store) {
  const html = await transport.getHtml(entry.url, {
    waitFor: `/Ajouter au panier|Indisponible/.test(document.body?.innerText ?? "")`,
  });
  return parseProduct(html, entry, store);
}

const clean = (s) => (s ?? "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const toNumber = (s) => {
  const m = String(s ?? "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

// Poids net total d'un conditionnement, en grammes (1 L compté comme 1 kg) :
// « le pot de 850g », « les 8 pots de 100g - 800g », « les 6 bouteilles de 50 cl »,
// « la boite de 10 - 1 kg », « les 2 boites de 140 g net égoutté chacune ».
const UNIT_G = { g: 1, gr: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };
export function packWeightG(packaging) {
  const text = (packaging || "").toLowerCase().replace(",", ".");
  const qty = String.raw`(\d+(?:\.\d+)?)\s*(kg|gr|g|ml|cl|l)\b`;
  const total = text.match(new RegExp(String.raw`-\s*` + qty));
  if (total) return parseFloat(total[1]) * UNIT_G[total[2]];
  const multi = text.match(new RegExp(String.raw`(\d+)\s+[a-zéèêûô']+\s+de\s+` + qty));
  if (multi) return parseInt(multi[1], 10) * parseFloat(multi[2]) * UNIT_G[multi[3]];
  const single = text.match(new RegExp(qty));
  return single ? parseFloat(single[1]) * UNIT_G[single[2]] : null;
}

// Texte d'un élément en gardant les retours à la ligne des <br>.
function textOf(el) {
  if (!el) return "";
  const copy = el.cloneNode(true);
  copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return clean(copy.textContent);
}

export function parseProduct(html, entry, store) {
  const { document } = parseHTML(html);

  // Garde-fou : sans le magasin dans l'en-tête, les prix affichés sont génériques.
  const header = clean(document.querySelector("header")?.textContent || document.body?.textContent?.slice(0, 5000));
  if (!header.includes(store.city)) {
    throw new Error(`page servie sans le magasin ${store.name} (prix non fiables)`);
  }

  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((s) => { try { return [].concat(JSON.parse(s.textContent)); } catch { return []; } })
    .find((x) => x["@type"] === "Product");
  if (!ld) throw new Error("fiche produit introuvable (pas de JSON-LD Product)");

  // Bloc d'achat : « la barquette de 1 kg | 10,95 €/Kg » puis « 10,95 € ».
  const leaves = [...document.querySelectorAll("main p, main span, main h1, main h2")]
    .filter((el) => !el.querySelector("p, span, h1, h2"))
    .map((el) => clean(el.textContent))
    .filter(Boolean);
  // Le bloc d'achat s'arrête avant les fiches repliables et les carrousels d'autres produits.
  const blockEnd = leaves.findIndex((t) => /^(Caractéristiques|Vous aimerez aussi|Produits similaires|Impact carbone)$/i.test(t));
  const block = blockEnd > 0 ? leaves.slice(0, blockEnd) : leaves;
  const packIndex = block.findIndex((t) => /\|\s*[\d,]+\s*€\s*\/\s*\w+/i.test(t));
  const unavailableIndex = block.findIndex((t) => /^indisponible$/i.test(t));
  let packaging = null, unitPrice = null, unit = null, price = null;
  if (packIndex >= 0) {
    const m = block[packIndex].match(/^(.*?)\s*\|\s*([\d,]+)\s*€\s*\/\s*(\w+)/i);
    packaging = clean(m[1]);
    unitPrice = toNumber(m[2]);
    unit = m[3].toLowerCase();
    price = toNumber(block.slice(packIndex + 1).find((t) => /^[\d,]+\s*€$/.test(t)));
  } else if (unavailableIndex > 0) {
    packaging = block[unavailableIndex - 1];
  }
  const available = price != null && unavailableIndex < 0;
  // Nutri-Score : le premier pictogramme de la page est celui du produit (les carrousels viennent après).
  const nutriScore = document.querySelector('main img[alt^="nutriscore/score="]')?.getAttribute("alt").split("=")[1]?.toUpperCase() ?? null;

  // Sections repliables : Caractéristiques, En savoir plus, Autres informations légales.
  const sections = [];
  let ingredients = null, allergens = null;
  for (const button of document.querySelectorAll('button[name^="accordion-"]')) {
    const title = button.getAttribute("name").replace(/^accordion-/, "").trim();
    const panel = button.parentElement?.querySelector('[aria-hidden]');
    if (!title || !panel) continue;
    const items = [];
    for (const labelEl of panel.querySelectorAll("div > div > p:first-child")) {
      const block = labelEl.parentElement.parentElement;
      const valueEl = [...block.children].find((c) => c !== labelEl.parentElement && c.tagName === "P");
      if (!valueEl) continue;
      const label = clean(labelEl.textContent);
      const value = textOf(valueEl);
      if (!label || !value || items.some((it) => it.label === label)) continue;
      items.push({ label, value });
    }
    for (const it of items) {
      if (/^ingr[ée]dients?$/i.test(it.label)) ingredients = it.value;
      if (/^allerg[èe]nes?$/i.test(it.label)) allergens = it.value;
    }
    const kept = items.filter((it) => !/^(ingr[ée]dients?|allerg[èe]nes?|contact fabricant)$/i.test(it.label));
    if (kept.length) sections.push({ title, items: kept });
  }

  // Tableau nutritionnel (pour 100 g ou 100 ml).
  const nutritionTable = [];
  const caption = [...document.querySelectorAll("caption")].find((c) => /valeur nutritionnelle/i.test(c.textContent));
  if (caption) {
    for (const tr of caption.closest("table").querySelectorAll("tr")) {
      const label = clean(tr.querySelector("th")?.textContent);
      const value = clean(tr.querySelector("td")?.textContent);
      if (label && value && value !== "-") nutritionTable.push({ label, value });
    }
  }
  const pick = (re) => toNumber(nutritionTable.find((r) => re.test(r.label))?.value);
  const energy = nutritionTable.find((r) => /^[ée]nergie/i.test(r.label))?.value;
  const nutrition = {
    energyKcal: energy ? toNumber((energy.match(/([\d.,]+)\s*kcal/i) || [])[1]) : null,
    fat: pick(/^mati[èe]res? grasses?/i),
    saturatedFat: pick(/satur/i),
    carbs: pick(/^glucides/i),
    sugars: pick(/^dont sucres?/i),
    fiber: pick(/^fibres/i),
    protein: pick(/^prot[ée]ines/i),
    salt: pick(/^sel/i),
  };

  // Prix au kilo. Le chiffre affiché par le site est parfois faux (vu : lait 6 × 50 cl à 4,74 €
  // affiché 0,79 €/L) : on le recalcule depuis le prix et le poids du conditionnement, et on ne
  // garde le chiffre du site que s'il concorde ou si le poids est variable (« environ »).
  let pricePerKg = unit === "kg" || unit === "l" ? unitPrice : null;
  let netWeightG = null;
  if (entry.unitNetWeightG) {
    // Vente à la pièce (œufs) : poids estimé dans le catalogue.
    const count = toNumber((packaging || "").match(/de (\d+)/)?.[1]);
    if (count) netWeightG = count * entry.unitNetWeightG;
  } else if (!/environ/i.test(packaging || "")) {
    netWeightG = packWeightG(packaging);
  }
  if (netWeightG && price != null) {
    const computed = Math.round(price / netWeightG * 1000 * 100) / 100;
    if (pricePerKg == null || Math.abs(computed - pricePerKg) / computed > 0.03) pricePerKg = computed;
  }

  return {
    id: entry.id,
    category: entry.category,
    source: id,
    url: entry.url,
    name: clean(ld.name),
    brand: clean(ld.brand?.name ?? ld.brand),
    image: ld.image ?? ld.images?.[0] ?? null,
    packaging,
    price,
    unitPrice,
    unit,
    pricePerKg,
    netWeightG,
    available,
    nutriScore: /^[A-E]$/.test(nutriScore ?? "") ? nutriScore : null,
    store: { name: store.name, city: store.city, postalCode: store.postalCode },
    estimate: entry.estimate ?? null,
    nutrition,
    nutritionTable,
    ingredients,
    allergens,
    sections,
    fetchedAt: new Date().toISOString(),
  };
}
