// Transports : récupèrent le HTML d'une page produit, rendu tel qu'un visiteur le voit.
// - opencli : vrai navigateur Chrome (Browser Bridge d'OpenCLI), passe l'anti-bot et
//   affiche les prix du magasin choisi. C'est le transport par défaut.
// - direct  : simple fetch HTTP, utilisé par la GitHub Action. Souvent bloqué (DataDome)
//   ou servi sans magasin : l'adaptateur rejette alors la page.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTransport(name, options = {}) {
  if (name === "opencli") return opencliTransport(options);
  if (name === "direct") return directTransport(options);
  throw new Error(`Transport inconnu : ${name}`);
}

function opencliTransport({ session = "protein-price", profile } = {}) {
  const browser = async (...args) => {
    const prefix = profile ? ["--profile", profile] : [];
    const { stdout } = await run("opencli", [...prefix, "browser", session, ...args], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  };
  return {
    name: "opencli",
    // Exécute du JS dans l'onglet (sert à poser le cookie du magasin).
    async eval(js) {
      return (await browser("eval", js)).trim();
    },
    async open(url) {
      await browser("open", url, "--window", "background");
    },
    async getHtml(url, { waitFor = "true", timeoutMs = 25000 } = {}) {
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

function directTransport({ cookies = {} } = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
  return {
    name: "direct",
    async eval() {},
    async open() {},
    async getHtml(url) {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          "accept-language": "fr-FR,fr;q=0.9",
          cookie,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return res.text();
    },
    async close() {},
  };
}
