import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { transform } from "esbuild";
const html = await readFile("dist/blue-98.html", "utf8");
assert(!/<script\b[^>]*\bsrc=/.test(html), "Script still needs another file");
assert(
  !/<link\b[^>]*\brel="stylesheet"/.test(html),
  "Stylesheet still needs another file",
);
assert(
  !/<(?:img|source)\b[^>]*\bsrc="https?:/.test(html),
  "Remote media remains",
);
const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert(js && js.length > 10000, "No bundled application");
await transform(js, { loader: "js", target: "es2022" });
assert(
  !/\bimport\s+[^;]*\sfrom\s*["']/.test(js),
  "External module import remains",
);
assert(
  html.includes("Permission is hereby granted"),
  "Third-party MIT license missing",
);
console.log(
  "PASS: self-contained HTML, embedded styles/script, JS parses, no external module imports, MIT notice included",
);
