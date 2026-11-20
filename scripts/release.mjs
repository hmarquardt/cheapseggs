import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_REPOSITORY !== "hmarquardt/cheapseggs" ||
  process.env.GITHUB_REF !== "refs/heads/main" ||
  process.env.GITHUB_SHA !== sha
) {
  throw new Error(
    "Production deploys run only from validated main in GitHub Actions. See docs/DEPLOYMENT.md.",
  );
}
if (!process.env.CLOUDFLARE_API_TOKEN)
  throw new Error("CLOUDFLARE_API_TOKEN repository secret is required.");
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) {
  throw new Error("Refusing a dirty release checkout.");
}
const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
if (config.name !== "cheapseggs" || config.vars.APP_ENV !== "production")
  throw new Error("Wrong release target.");
run("npm", ["run", "config:check"]);
run("npx", [
  "wrangler",
  "d1",
  "time-travel",
  "info",
  "DB",
  "--config",
  "wrangler.production.jsonc",
  "--json",
]);
// Only repository-reviewed migrations; no automatic provisioner or guessed bindings.
run("npx", [
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--remote",
  "--config",
  "wrangler.production.jsonc",
]);
run("npx", [
  "wrangler",
  "d1",
  "execute",
  "DB",
  "--remote",
  "--config",
  "wrangler.production.jsonc",
  "--file",
  "seeds/production.sql",
]);
run("npx", [
  "wrangler",
  "deploy",
  "--config",
  "wrangler.production.jsonc",
  "--no-x-provision",
  "--tag",
  sha,
  "--var",
  `DEPLOY_REVISION:${sha}`,
]);
