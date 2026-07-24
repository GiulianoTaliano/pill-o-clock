#!/usr/bin/env node
/**
 * Strip paid-only iOS entitlements from the generated *.entitlements file so the
 * app can be signed with a FREE Apple ID ("Personal Team") for on-device testing
 * (no paid Apple Developer account, no App Store / TestFlight).
 *
 * A free Apple ID cannot sign these capabilities:
 *   • aps-environment — Push Notifications. Pill O-Clock only uses LOCAL
 *     notifications, so removing it changes nothing functionally on device.
 *   • com.apple.developer.usernotifications.critical-alerts — needs a paid
 *     account plus explicit Apple approval; the simulator ignores it anyway.
 *
 * Why a post-prebuild script instead of a config plugin: aps-environment is
 * injected by an Expo core mod that runs after every user config plugin, so it
 * can't be stripped reliably from the config. Editing the generated file after
 * `expo prebuild` is order-proof.
 *
 * Usage:
 *   npx expo prebuild -p ios
 *   node scripts/strip-ios-entitlements.mjs
 *   # then build/run from Xcode (open ios/*.xcworkspace) — NOT `expo run:ios`,
 *   # which re-runs prebuild and re-adds the entitlements.
 *
 * ⚠️ Temporary/dev-only: do NOT use for production, TestFlight or App Store
 * builds — those need the real entitlements and a paid account.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PAID_ONLY_ENTITLEMENTS = [
  "aps-environment",
  "com.apple.developer.usernotifications.critical-alerts",
];

const IOS_DIR = join(process.cwd(), "ios");

if (!existsSync(IOS_DIR)) {
  console.error("✖ ios/ not found. Run `npx expo prebuild -p ios` first.");
  process.exit(1);
}

// Find the app target's .entitlements file: ios/<Name>/<Name>.entitlements
// (ignore anything under Pods/).
function findEntitlements(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "Pods" || name.endsWith(".xcodeproj") || name.endsWith(".xcworkspace")) continue;
    const full = join(dir, name);
    let stat;
    try { stat = readdirSync(full); } catch { continue; } // not a dir
    const ent = stat.find((f) => f.endsWith(".entitlements"));
    if (ent) return join(full, ent);
  }
  return null;
}

const entFile = findEntitlements(IOS_DIR);
if (!entFile) {
  console.error("✖ No *.entitlements file found under ios/. Did prebuild run?");
  process.exit(1);
}

let xml = readFileSync(entFile, "utf8");
const removed = [];
for (const key of PAID_ONLY_ENTITLEMENTS) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Remove `<key>NAME</key>` plus its following value node
  // (<string>…</string>, <true/>, <false/>, <integer>…</integer>, …).
  const re = new RegExp(
    `\\s*<key>${escaped}</key>\\s*(?:<(string|integer|real)>[^<]*</\\1>|<(?:true|false)\\s*/>)`,
    "g",
  );
  const before = xml.length;
  xml = xml.replace(re, "");
  if (xml.length !== before) removed.push(key);
}

writeFileSync(entFile, xml);

console.log(`✔ Stripped paid-only entitlements from ${entFile.replace(process.cwd() + "/", "")}`);
console.log(removed.length ? `  Removed: ${removed.join(", ")}` : "  (nothing to remove — already stripped)");
console.log("  Next: open ios/*.xcworkspace in Xcode, select your Personal Team, Run on device.");
