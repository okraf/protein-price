# Prix des Protéines

Quelle protéine coûte le moins cher ? Classement du **prix de 100 g de protéines** (poulet, œufs, skyr, cacahuètes, lentilles...) au prix réel du magasin.

En ligne : https://okraf.github.io/protein-price/

## Calcul
- Quantité pour 100 g de protéines = `100 ÷ protéines pour 100 g × 100`
- Prix de 100 g de protéines = `prix au kilo ÷ 1000 × quantité pour 100 g de protéines`
- Prix au kilo : celui affiché par le magasin (litre compté comme kilo). Œufs vendus à la pièce : poids estimé dans `data/catalog.json` (`unitNetWeightG`).
- Protéines : étiquette nutritionnelle de la fiche produit.
- Part des calories : grammes de l'étiquette × coefficients réglementaires UE (protéines et glucides 4, lipides 9, fibres 2), rapportés à leur somme.
- Eau : moyenne de la table [Ciqual 2025](https://doi.org/10.57745/RDMHWY) (ANSES, Licence Ouverte Etalab 2.0) pour l'aliment le plus proche.

## Structure
- `index.html` : page unique (classement + fiche produit via `#/produit/<id>`), charte Perceval, sans build.
- `data/catalog.json` : magasins et produits suivis (URL de la fiche, catégorie affichée).
- `data/products.json` : données générées, lues par la page.
- `data/composition.json` : teneur en eau par produit (code et nom Ciqual), maintenue à la main, non touchée par le relevé des prix.
- `sources/` : une source par enseigne (`intermarche.mjs` pour l'instant), déclarée dans `sources/index.mjs`.
- `scripts/update.mjs` : relève les fiches du catalogue et réécrit `data/products.json`.

## Mettre à jour les prix
Intermarché est protégé par un anti-bot (DataDome) et n'affiche les prix du magasin qu'à un vrai navigateur. Pas de mise à jour automatique : on relance à la main de temps en temps, via [OpenCLI](https://github.com/jackwener/opencli) (extension Browser Bridge).

```sh
npm install
node scripts/update.mjs                      # tous les produits
node scripts/update.mjs --only skyr,oeufs    # quelques produits
```

Le script attend 20 à 40 s entre deux fiches pour rester à un rythme raisonnable. Il refuse une page qui n'affiche pas le magasin attendu, recalcule le prix au kilo depuis le prix et le poids du paquet quand le chiffre du site est faux, et rejette une fiche sans protéines.

## Ajouter un produit
Ajouter une entrée dans `data/catalog.json` (`id`, `category`, `source`, `url` de la fiche ; `store` pour un produit relevé dans un autre magasin que celui de l'enseigne), puis `node scripts/update.mjs --only <id>`. Ajouter sa teneur en eau dans `data/composition.json` (sinon la fiche indique qu'elle manque).

## Ajouter une enseigne
Créer `sources/<enseigne>.mjs` (exports `id`, `label`, `homepage`, `selectStore`, `fetchProduct`), l'ajouter à `sources/index.mjs` et déclarer son magasin dans `stores` de `data/catalog.json`.

## Lancer en local
`npm run serve` puis http://localhost:8000
