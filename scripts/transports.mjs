// Transport : récupère le HTML d'une page produit, rendu tel qu'un visiteur le voit, via un
// vrai navigateur Chrome piloté par OpenCLI (Browser Bridge). Les enseignes protégées par un
// anti-bot (DataDome chez Intermarché) n'affichent les prix du magasin qu'à un navigateur.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTransport({ session = "protein-price", profile } = {}) {
  const browser = async (...args) => {
    const prefix = profile ? ["--profile", profile] : [];
    const { stdout } = await run("opencli", [...prefix, "browser", session, ...args], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  };
  return {
    // Exécute du JS dans l'onglet (sert à poser le cookie du magasin).
    async eval(js) {
      return (await browser("eval", js)).trim();
    },
    async open(url) {
      await browser("open", url, "--window", "background");
    },
    async getHtml(url, { waitFor = "true", timeoutMs = 30000 } = {}) {
      await browser("open", url, "--window", "background");
      const deadline = Date.now() + timeoutMs;
      // Attend que la page client ait affiché le prix du magasin (expression JS fournie par la source).
      while (Date.now() < deadline) {
        const ready = (await browser("eval", `(${waitFor}) ? "1" : "0"`)).trim();
        if (ready.startsWith("1")) break;
        await sleep(1000);
      }
      return browser("eval", "document.documentElement.outerHTML");
    },
    async close() {
      await browser("close").catch(() => {});
    },
  };
}
