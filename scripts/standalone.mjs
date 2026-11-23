import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const dir = path.resolve("dist");
let html = await readFile(path.join(dir, "index.html"), "utf8");
for (const match of [
  ...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g),
]) {
  const js = await readFile(
    path.join(dir, match[1].replace(/^\//, "")),
    "utf8",
  );
  html = html.replace(
    match[0],
    () =>
      '<script type="module">' +
      js.replace(/<\/script/gi, "<\\/script") +
      "</script>",
  );
}
for (const match of [
  ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
]) {
  const css = await readFile(
    path.join(dir, match[1].replace(/^\//, "")),
    "utf8",
  );
  html = html.replace(match[0], () => "<style>" + css + "</style>");
}
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
const license = await readFile("node_modules/three/LICENSE", "utf8");
html = html.replace(
  "<head>",
  "<head><!-- Three.js license\n" + license.replace(/--/g, "—") + "\n-->",
);
if (/(?:src|href)="\/assets\//.test(html))
  throw Error("Unbundled asset remains");
await writeFile(path.join(dir, "blue-98.html"), html);
console.log(
  `Standalone: dist/blue-98.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB), all runtime resources embedded.`,
);
