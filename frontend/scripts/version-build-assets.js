const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "build", "index.html");
const version = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || Date.now().toString()).slice(0, 12);
let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(
  /(\/static\/(?:js|css)\/[^"'?]+\.(?:js|css))(?=["'])/g,
  `$1?v=${version}`,
);

fs.writeFileSync(indexPath, html);
console.log(`Version navigateur appliquée : ${version}`);
