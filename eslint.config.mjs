import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    /*
     * Les càmeres van amb `<img>` i no amb `next/image`, a posta.
     *
     * `next/image` optimitza la imatge quan arriba la petició, i això a Vercel
     * és un comptador a part amb el seu propi límit gratuït. Aquí no hi ha res
     * a optimitzar en aquell moment: el worker ja ha desat cada fotograma en
     * les dues úniques mides que la web ensenya —400 px per a la reixa i 1.280
     * per a la fitxa—, així que el transformador només afegiria una quota i una
     * dependència de plataforma per tornar a fer una feina feta.
     *
     * L'avís parla de l'LCP, i les mesures hi són: amplada i alçada posades
     * sempre —cap salt de disposició— i càrrega diferida a les miniatures.
     */
    files: ["src/app/cameres/**/*.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;
