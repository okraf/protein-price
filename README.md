# Prix des Protéines

Quelle protéine coûte le moins cher ? Classement du **prix de 100 g de protéines** (poulet, œufs, skyr, cacahuètes, lentilles...) au prix réel du magasin.

En ligne : https://okraf.github.io/protein-price/

## Calcul
- Quantité pour 100 g de protéines = `100 ÷ protéines pour 100 g × 100`
- Prix de 100 g de protéines = `prix au kilo ÷ 1000 × quantité pour 100 g de protéines`
- Prix au kilo : celui affiché par le magasin (litre compté comme kilo). Œufs vendus à la pièce : poids estimé dans `data/catalog.json` (`unitNetWeightG`).
- Protéines : étiquette nutritionnelle de la fiche produit.

## Structure
- `index.html` : page unique (classement + fiche produit via `#/produit/<id>`), charte Perceval, sans build.
- `data/catalog.json` : magasins et produits suivis (URL de la fiche, catégorie affichée).
- `data/products.json` : données générées, lues par la page.
- `sources/` : une source par enseigne (`intermarche.mjs` pour l'instant), déclarée dans `sources/index.mjs`.
- `scripts/update.mjs` : relève les fiches du catalogue et réécrit `data/products.json`.

## Mettre à jour les prix
Intermarché est protégé par un anti-bot et n'affiche les prix du magasin qu'à un vrai navigateur. La mise à jour passe donc par [OpenCLI](https://github.com/jackwener/opencli) (extension Browser Bridge connectée à Chrome) :

```sh
npm install
npm run update            # tous les produits
node scripts/update.mjs --only skyr,oeufs
git commit -am "Update prices" && git push
```

La GitHub Action `update-prices.yml` tente la même chose chaque lundi en requête directe. Elle échoue en général (anti-bot, ou page servie sans magasin) et ne publie alors rien : le script refuse les prix qui ne viennent pas du magasin choisi.

## Ajouter un produit
Ajouter une entrée dans `data/catalog.json` (`id`, `category`, `source`, `url` de la fiche), puis `node scripts/update.mjs --only <id>`.

## Ajouter une enseigne
Créer `sources/<enseigne>.mjs` (exports `id`, `label`, `homepage`, `prepare`, `fetchProduct`), l'ajouter à `sources/index.mjs` et déclarer son magasin dans `stores` de `data/catalog.json`.

## Lancer en local
`npm run serve` puis http://localhost:8000
