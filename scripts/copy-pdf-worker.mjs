// Copies the pdf.js runtime assets into /public so they are served statically.
// Running from postinstall keeps worker, fonts, cmaps and wasm locked to the
// installed pdfjs-dist version.
import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageJson = require.resolve("pdfjs-dist/package.json");
const packageDir = path.dirname(packageJson);
const publicDir = path.join(process.cwd(), "public");
const targetDir = path.join(publicDir, "pdf");

await mkdir(targetDir, { recursive: true });

await copyFile(
  path.join(packageDir, "build", "pdf.worker.min.mjs"),
  path.join(publicDir, "pdf.worker.min.mjs"),
);

for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  const target = path.join(targetDir, directory);
  await rm(target, { recursive: true, force: true });
  await cp(path.join(packageDir, directory), target, { recursive: true });
}

console.log("pdf.js assets → public/pdf.worker.min.mjs, public/pdf/{cmaps,standard_fonts,wasm}");
