// Registre des sources de prix. Pour ajouter une enseigne : créer sources/<id>.mjs
// (exports id, label, homepage, prepare, fetchProduct) et l'ajouter ici.
import * as intermarche from "./intermarche.mjs";

export const sources = { [intermarche.id]: intermarche };
