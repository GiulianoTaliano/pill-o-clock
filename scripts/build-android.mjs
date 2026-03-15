/**
 * Local Android production build with Sentry source-map upload.
 *
 * Reads the Sentry auth token from ~/.sentryclirc (created by `npx sentry-cli login`)
 * and passes it as SENTRY_AUTH_TOKEN to Gradle so the @sentry/react-native plugin
 * can upload source maps automatically.
 *
 * Usage: npm run build:android
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

// ─── Resolve Sentry auth token ─────────────────────────────────────────────
// Priority: SENTRY_AUTH_TOKEN env var → .env.local → ~/.sentryclirc
const sentryclirc = join(homedir(), ".sentryclirc");
let authToken = process.env.SENTRY_AUTH_TOKEN || "";

if (!authToken) {
  try {
    const env = readFileSync(".env.local", "utf8");
    authToken = env.match(/^SENTRY_AUTH_TOKEN=(.+)/m)?.[1]?.trim() || "";
    if (authToken) console.log("Using SENTRY_AUTH_TOKEN from .env.local");
  } catch {
    // file doesn't exist
  }
}

if (!authToken) {
  try {
    const rc = readFileSync(sentryclirc, "utf8");
    authToken = rc.match(/token=(.+)/)?.[1]?.trim() || "";
    if (authToken) console.log("Using Sentry token from ~/.sentryclirc");
  } catch {
    // file doesn't exist
  }
}

if (!authToken) {
  console.error(
    "ERROR: No Sentry auth token found.\n" +
      "Run `npx sentry-cli login` or set SENTRY_AUTH_TOKEN env variable."
  );
  process.exit(1);
}

console.log("Sentry auth token found. Source maps will be uploaded.\n");

// ─── Run Gradle bundleRelease ───────────────────────────────────────────────
const androidDir = resolve("android");

try {
  execSync("gradlew.bat bundleRelease --console=plain", {
    cwd: androidDir,
    stdio: "inherit",
    env: {
      ...process.env,
      SENTRY_AUTH_TOKEN: authToken,
    },
  });
} catch {
  process.exit(1);
}

console.log(
  "\nBuild complete! AAB at: android/app/build/outputs/bundle/release/app-release.aab"
);
