import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
export default defineConfig({
  plugins: [
    {
      name: "local-evidence",
      configureServer(server) {
        server.middlewares.use("/__evidence", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end();
            return;
          }
          let chunks: Buffer[] = [];
          let n = 0;
          req.on("data", (b) => {
            n += b.length;
            if (n > 12e6) {
              req.destroy();
              return;
            }
            chunks.push(b);
          });
          req.on("end", () => {
            try {
              const d = JSON.parse(Buffer.concat(chunks).toString());
              if (!/^[a-z0-9_-]+$/.test(d.name)) throw Error("name");
              fs.mkdirSync("evidence/renders", { recursive: true });
              const ext = d.image ? "png" : "json";
              fs.writeFileSync(
                path.join("evidence/renders", d.name + "." + ext),
                d.image
                  ? Buffer.from(d.image.split(",")[1], "base64")
                  : JSON.stringify(d.data, null, 2),
              );
              res.end("ok");
            } catch {
              res.statusCode = 400;
              res.end("invalid");
            }
          });
        });
      },
    },
  ],
  build: { target: "es2022" },
});
