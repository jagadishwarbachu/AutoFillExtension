const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("0.8 release metadata and adapter injection stay aligned", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const content = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const popup = fs.readFileSync(path.join(__dirname, "popup.js"), "utf8");

  assert.equal(manifest.version, "0.8.0");
  assert.equal(packageMetadata.version, manifest.version);
  assert.match(content, /const SCRIPT_VERSION = "0\.8\.0"/);
  assert.match(popup, /files: \["job-board-adapters\.js", "content\.js"\]/);
  assert.equal(manifest.oauth2.scopes.length, 1);
  assert.equal(manifest.oauth2.scopes[0], "https://www.googleapis.com/auth/gmail.compose");
});
