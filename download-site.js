const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const BASE = "https://afitcbtsim.name.ng";

const START_PATHS = [
  "/admin/",
  "/admin-staging/",
  "/wgroup/",
  "/wgroup-admin/",
  "/question-bank/",
  "/exam-room/",
  "/login/",
  "/bio-data/"
];

const OUTPUT = path.join(process.cwd(), "afitcbtsim-public");

const visited = new Set();
const queue = [...START_PATHS];

function normalizeUrl(url) {
  try {
    const u = new URL(url, BASE);

    if (u.hostname !== new URL(BASE).hostname) {
      return null;
    }

    u.hash = "";

    // Remove query strings for files unless they are important routes
    if (path.extname(u.pathname)) {
      u.search = "";
    }

    return u.href;
  } catch {
    return null;
  }
}

function localPath(url) {
  const u = new URL(url);
  let pathname = decodeURIComponent(u.pathname);

  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  if (!path.extname(pathname)) {
    pathname += "/index.html";
  }

  return path.join(OUTPUT, pathname.replace(/^[/\\]+/, ""));
}

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;

    const request = client.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      },
      response => {
        // Follow redirects
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          const redirected = normalizeUrl(
            new URL(response.headers.location, url).href
          );

          response.resume();

          if (!redirected) {
            return reject(new Error("Redirect leaves domain"));
          }

          return download(redirected).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          response.resume();
          return reject(
            new Error(`HTTP ${response.statusCode}`)
          );
        }

        const chunks = [];

        response.on("data", chunk => chunks.push(chunk));

        response.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      }
    );

    request.setTimeout(15000, () => {
      request.destroy(new Error("Timeout"));
    });

    request.on("error", reject);
  });
}

function extractUrls(text, currentUrl) {
  const results = [];

  // HTML attributes
  const htmlRegex =
    /(?:href|src|action|poster|data-src|data-href)\s*=\s*["']([^"']+)["']/gi;

  let match;

  while ((match = htmlRegex.exec(text))) {
    results.push(match[1]);
  }

  // CSS url(...)
  const cssRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

  while ((match = cssRegex.exec(text))) {
    results.push(match[1]);
  }

  return results
    .map(value => value.trim())
    .filter(value =>
      value &&
      !value.startsWith("#") &&
      !value.startsWith("data:") &&
      !value.startsWith("javascript:") &&
      !value.startsWith("mailto:")
    )
    .map(value => {
      try {
        return normalizeUrl(new URL(value, currentUrl).href);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function shouldProcessAsText(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();

  return [
    "",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".mjs",
    ".json",
    ".xml",
    ".svg",
    ".map",
    ".txt"
  ].includes(ext);
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });

  console.log("");
  console.log("========================================");
  console.log(" AFIT CBT SIM PUBLIC SITE DOWNLOADER");
  console.log("========================================");
  console.log("");
  console.log(`Saving to: ${OUTPUT}`);
  console.log("");

  while (queue.length > 0) {
    const rawUrl = queue.shift();
    const url = normalizeUrl(rawUrl);

    if (!url || visited.has(url)) {
      continue;
    }

    visited.add(url);

    console.log(`[${visited.size}] ${url}`);

    try {
      const data = await download(url);
      const destination = localPath(url);

      fs.mkdirSync(path.dirname(destination), {
        recursive: true
      });

      fs.writeFileSync(destination, data);

      console.log(`    -> ${path.relative(process.cwd(), destination)}`);

      if (shouldProcessAsText(url)) {
        const text = data.toString("utf8");

        const discovered = extractUrls(text, url);

        for (const next of discovered) {
          if (!visited.has(next)) {
            queue.push(next);
          }
        }
      }
    } catch (error) {
      console.log(`    FAILED: ${error.message}`);
    }
  }

  console.log("");
  console.log("========================================");
  console.log(" DOWNLOAD COMPLETE");
  console.log("========================================");
  console.log("");
  console.log(`Files saved in: ${OUTPUT}`);
  console.log(`URLs processed: ${visited.size}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});