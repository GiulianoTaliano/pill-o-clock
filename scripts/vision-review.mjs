#!/usr/bin/env node

/**
 * Automated Vision UI Review Pipeline for Pill O-Clock
 *
 * Uses GitHub Models API (included in Copilot subscription) to analyze
 * screenshots with AI vision capabilities, then creates GitHub issues.
 *
 * Usage:
 *   node scripts/vision-review.mjs <screenshot-dir> [options]
 *
 * Options:
 *   --dry-run       Analyze only, don't create GitHub issues
 *   --model <id>    Model ID (default: openai/gpt-4.1 or env VISION_MODEL)
 *   --list-models   Show available models and exit
 *   --help          Show usage
 *
 * Environment:
 *   GITHUB_TOKEN    GitHub PAT with 'models:read' + 'repo' scopes
 *   VISION_MODEL    Override default model ID
 *
 * The PAT needs:
 *   - 'models:read' (fine-grained) or broad classic PAT for GitHub Models API
 *   - 'repo' scope for creating GitHub issues
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

// â�€â�€â�€ Configuration â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

const MODELS_API = 'https://models.github.ai/inference/chat/completions';
const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'GiulianoTaliano';
const REPO_NAME = 'pill-o-clock';
const DEFAULT_MODEL = 'openai/gpt-4.1';
const ISSUE_LABELS = ['ui', 'accessibility', 'visual-bug'];

const SCREENS = {
  home:             { name: 'Home / Today',   files: ['app/(tabs)/index.tsx', 'components/DoseCard.tsx'] },
  medications:      { name: 'Medications',    files: ['app/(tabs)/medications.tsx', 'components/MedicationCard.tsx'] },
  calendar:         { name: 'Calendar',       files: ['app/(tabs)/calendar.tsx'] },
  health:           { name: 'Health',         files: ['app/(tabs)/health.tsx', 'components/SimpleLineChart.tsx'] },
  history:          { name: 'History',        files: ['app/(tabs)/history.tsx'] },
  settings:         { name: 'Settings',       files: ['app/(tabs)/settings.tsx'] },
  'medication-new': { name: 'New Medication', files: ['app/medication/new.tsx', 'components/MedicationForm.tsx'] },
  alarm:            { name: 'Alarm',          files: ['app/alarm.tsx'] },
  onboarding:       { name: 'Onboarding',     files: ['app/onboarding.tsx'] },
  // Interaction captures
  'home-dose-tap':          { name: 'Dose Card Tap',      files: ['app/(tabs)/index.tsx', 'components/DoseCard.tsx'] },
  'medication-detail':      { name: 'Medication Detail',   files: ['app/medication/[id].tsx', 'components/MedicationForm.tsx'] },
  'medication-form-filled': { name: 'Medication Form (filled)', files: ['app/medication/new.tsx', 'components/MedicationForm.tsx'] },
  'calendar-detail':        { name: 'Calendar Detail',     files: ['app/(tabs)/calendar.tsx', 'components/AppointmentDetailModal.tsx'] },
  'health-scrolled':        { name: 'Health (scrolled)',   files: ['app/(tabs)/health.tsx', 'components/SimpleLineChart.tsx'] },
  'history-scrolled':       { name: 'History (scrolled)',  files: ['app/(tabs)/history.tsx'] },
  'settings-scrolled':      { name: 'Settings (scrolled)', files: ['app/(tabs)/settings.tsx'] },
};

// â�€â�€â�€ CLI Parsing â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function parseCli() {
  const args = process.argv.slice(2);
  const opts = {
    screenshotDir: null,
    dryRun: false,
    model: process.env.VISION_MODEL || DEFAULT_MODEL,
    listModels: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':     opts.dryRun = true; break;
      case '--model':       opts.model = args[++i]; break;
      case '--list-models': opts.listModels = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (!args[i].startsWith('--')) opts.screenshotDir = args[i];
    }
  }

  return opts;
}

function printUsage() {
  console.log(`
Usage: node scripts/vision-review.mjs <screenshot-dir> [options]

Options:
  --dry-run       Analyze only, don't create GitHub issues
  --model <id>    Model ID (default: openai/gpt-5)
  --list-models   Show available models and exit
  --help          Show this help

Environment:
  GITHUB_TOKEN    GitHub PAT with 'models:read' + 'repo' scopes
  VISION_MODEL    Override default model ID

Examples:
  node scripts/vision-review.mjs ./screenshots/2026-03-14_03-25-45
  node scripts/vision-review.mjs ./screenshots/latest --dry-run
  node scripts/vision-review.mjs ./screenshots/latest --model anthropic/claude-sonnet-4
  node scripts/vision-review.mjs --list-models
`);
}

// â�€â�€â�€ Token Resolution â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function resolveToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required.');
    console.error('Create a PAT at https://github.com/settings/tokens');
    console.error('Required scopes: models:read, repo');
    console.error('');
    console.error('  PowerShell:  $env:GITHUB_TOKEN = "ghp_..."');
    console.error('  Bash:        export GITHUB_TOKEN="ghp_..."');
    process.exit(1);
  }
  return token;
}

// â�€â�€â�€ Image Resize â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function resizeImageToBase64(filePath, maxWidth = 768) {
  try {
    const script = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.Drawing',
      `$img = [System.Drawing.Image]::FromFile("${filePath.replace(/"/g, '`"')}")`,
      `$maxW = ${maxWidth}`,
      'if ($img.Width -gt $maxW) {',
      '  $ratio = $maxW / $img.Width',
      '  $nw = $maxW; $nh = [int]($img.Height * $ratio)',
      '} else { $nw = $img.Width; $nh = $img.Height }',
      '$bmp = New-Object System.Drawing.Bitmap $nw,$nh',
      '$g = [System.Drawing.Graphics]::FromImage($bmp)',
      '$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
      '$g.DrawImage($img, 0, 0, $nw, $nh)',
      '$g.Dispose(); $img.Dispose()',
      '$ms = New-Object System.IO.MemoryStream',
      '$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }',
      '$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)',
      '$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]75)',
      '$bmp.Save($ms, $codec, $ep)',
      '$bytes = $ms.ToArray()',
      '$bmp.Dispose(); $ms.Dispose()',
      '[Convert]::ToBase64String($bytes)',
    ].join('\n');

    const result = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return { base64: result.trim(), mimeType: 'image/jpeg' };
  } catch {
    // Fallback: raw PNG (no resize available)
    const buffer = readFileSync(filePath);
    return { base64: buffer.toString('base64'), mimeType: 'image/png' };
  }
}

// â�€â�€â�€ Load Screenshots â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function loadScreenshots(dir) {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) {
    console.error(`Error: Screenshot directory not found: ${absDir}`);
    process.exit(1);
  }

  // Group images by screen key
  const screens = new Map();

  for (const themeDir of ['light', 'dark']) {
    const themePath = join(absDir, themeDir);
    if (!existsSync(themePath)) continue;

    for (const file of readdirSync(themePath).filter(f => f.endsWith('.png')).sort()) {
      const filePath = join(themePath, file);
      const screen = file.replace(/^(light|dark)_/, '').replace(/\.png$/, '');

      process.stdout.write(`    Resizing ${file}...`);
      const { base64, mimeType } = resizeImageToBase64(filePath);
      if (!base64 || base64.length === 0) {
        console.log(' SKIPPED (empty file)');
        continue;
      }
      const sizeKB = Math.round(base64.length * 3 / 4096);
      console.log(` ${sizeKB}KB (${mimeType.split('/')[1]})`);

      if (!screens.has(screen)) screens.set(screen, {});
      screens.get(screen)[themeDir] = { file, base64, mimeType, sizeKB };
    }
  }

  if (screens.size === 0) {
    console.error(`Error: No PNG screenshots found in ${absDir}`);
    process.exit(1);
  }

  return screens;
}

// â�€â�€â�€ System Prompt â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function buildSystemPrompt(screenKey) {
  const screen = SCREENS[screenKey];
  const name = screen?.name || screenKey;
  const files = screen?.files || [];

  return `You are a UI/UX accessibility auditor for Pill O-Clock, a medication management app for elderly users (React Native / Expo / NativeWind).

DESIGN TOKENS:
Light: bg=#F0F6FF, card=#FFFFFF, text=#1E293B, muted=#94A3B8, border=#E2E8F0
Dark:  bg=#020617, card=#0F172A, text=#F1F5F9, muted=#64748B, border=#1E293B

SCREEN: "${name}" â€� Source files: ${files.map(f => '`' + f + '`').join(', ') || 'unknown'}

AUDIT CRITERIA:
1. WCAG contrast: AA min (4.5:1 text, 3:1 UI), AAA target (7:1)
2. Touch targets: >=44x44pt for elderly users, >=8pt gaps
3. Visual consistency: spacing, typography hierarchy, color tokens
4. Overflow/clipping: truncation, bleed, hidden content
5. Empty/error states: informative, actionable, consistent
6. Dark mode: semantic tokens, no hardcoded colors, adequate contrast

SEVERITY:
- CRITICAL: Accessibility barrier affecting medication safety
- HIGH: Significant usability problem for elderly users
- MEDIUM: Visual inconsistency or minor accessibility gap
- LOW: Polish/cosmetic improvement

Respond ONLY with valid JSON (no markdown fences, no explanation):
{
  "findings": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "title": "Short descriptive title",
      "category": "contrast|touch-targets|consistency|overflow|empty-states|dark-mode",
      "description": "What is wrong and impact on elderly users",
      "theme": "light|dark|both",
      "file": "primary source file path",
      "wcag": "criterion number or null",
      "suggestedFix": "code-level recommendation"
    }
  ]
}`;
}

// â�€â�€â�€ API Calling â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

async function callModelsAPI(messages, token, model) {
  const body = {
    model,
    messages,
    temperature: 0.15,
  };

  // GPT-5 and o-series models require max_completion_tokens
  if (model.includes('gpt-5') || /\bo[1-9]/.test(model)) {
    body.max_completion_tokens = 4000;
  } else {
    body.max_tokens = 4000;
  }

  const response = await fetch(MODELS_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'pill-o-clock-vision-review',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`API ${response.status}: ${errText.slice(0, 500)}`);
    err.status = response.status;
    // Extract Retry-After header for smarter backoff
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) err.retryAfterMs = parseInt(retryAfter, 10) * 1000 || 60000;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSON(raw) {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();

  return JSON.parse(cleaned);
}

const MAX_RETRY_DELAY_MS = 120_000; // 2 minutes — skip screen beyond this

async function callWithRetry(messages, token, model, maxRetries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const raw = await callModelsAPI(messages, token, model);
      return parseJSON(raw);
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        // Rate limit (429) or server error (5xx): wait and retry
        if (err.status === 429 || (err.status >= 500 && err.status < 600)) {
          const rawDelay = err.retryAfterMs || 30000 * attempt;

          // If the server asks to wait more than 2 min, the daily/hourly
          // rate limit is exhausted — retrying is pointless.
          if (rawDelay > MAX_RETRY_DELAY_MS) {
            const mins = Math.round(rawDelay / 60000);
            console.log(`    Rate limit: server asks to wait `+mins+` min -- skipping (max `+(MAX_RETRY_DELAY_MS/1000)+`s).`);
            err.rateLimitExhausted = true;
            throw err;
          }

          console.log(`    Retry `+attempt+`/`+maxRetries+` in `+(rawDelay/1000)+`s (`+err.status+`)...`);
          await sleep(rawDelay);
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// â�€â�€â�€ Per-Screen Analysis â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

async function analyzeScreen(screenKey, images, token, model) {
  const systemPrompt = buildSystemPrompt(screenKey);
  const screenName = SCREENS[screenKey]?.name || screenKey;

  // Build multimodal content: text label + image for each theme
  const content = [
    { type: 'text', text: `Analyze this screen ("${screenName}") in both themes. Return findings as JSON.` },
  ];

  for (const theme of ['light', 'dark']) {
    const img = images[theme];
    if (!img) continue;
    content.push(
      { type: 'text', text: `[${theme.toUpperCase()}] ${img.file}` },
      { type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.base64}`, detail: 'low' } },
    );
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content },
  ];

  try {
    const result = await callWithRetry(messages, token, model);
    const findings = result.findings || [];
    // Tag each finding with its screen key
    for (const f of findings) {
      f.screen = f.screen || screenKey;
    }
    return findings;
  } catch (err) {
    // If token limit exceeded (422), try one image at a time
    if (err.status === 422) {
      console.log('    Token limit hit â€� waiting 20s then splitting into single-image requests...');
      await sleep(20000);
      return await analyzeScreenSplit(screenKey, images, token, model);
    }
    throw err;
  }
}

async function analyzeScreenSplit(screenKey, images, token, model) {
  const systemPrompt = buildSystemPrompt(screenKey);
  const screenName = SCREENS[screenKey]?.name || screenKey;
  const allFindings = [];

  for (const theme of ['light', 'dark']) {
    const img = images[theme];
    if (!img) continue;

    const content = [
      { type: 'text', text: `Analyze this ${theme} mode screenshot of "${screenName}". Return findings as JSON.` },
      { type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.base64}`, detail: 'low' } },
    ];

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ];

    await sleep(10000); // Rate limit courtesy â€� generous delay between requests
    const result = await callWithRetry(messages, token, model);
    const findings = result.findings || [];
    for (const f of findings) {
      f.screen = f.screen || screenKey;
      f.theme = f.theme || theme;
    }
    allFindings.push(...findings);
  }

  return allFindings;
}

// â�€â�€â�€ Finding Aggregation â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function groupFindings(allFindings) {
  // Group findings with similar titles into issues
  const issues = [];

  for (const finding of allFindings) {
    const existing = issues.find(issue =>
      issue.severity === finding.severity && titleSimilar(issue.title, finding.title)
    );

    if (existing) {
      existing.findings.push(finding);
      // Collect unique screens
      if (!existing.screens.includes(finding.screen)) {
        existing.screens.push(finding.screen);
      }
    } else {
      issues.push({
        title: finding.title,
        severity: finding.severity,
        category: finding.category,
        screens: [finding.screen],
        findings: [finding],
      });
    }
  }

  // Sort: CRITICAL first, then HIGH, MEDIUM, LOW
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  issues.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));

  return issues;
}

function titleSimilar(a, b) {
  const stopWords = new Set(['the', 'a', 'an', 'on', 'in', 'for', 'of', 'is', 'and', 'or', 'too', 'not', 'no', 'are', 'has', 'vision']);
  const normalize = s => s.toLowerCase().replace(/[[\]()]/g, '').split(/\s+/).filter(w => !stopWords.has(w) && w.length > 2);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const setB = new Set(wordsB);
  const overlap = wordsA.filter(w => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length) > 0.5;
}

function screenOverlap(newScreens, existingBody) {
  // Check if issue body mentions the same screens
  if (!existingBody || !newScreens?.length) return false;
  const bodyLower = existingBody.toLowerCase();
  const matchCount = newScreens.filter(s => {
    const screenName = (SCREENS[s]?.name || s).toLowerCase();
    return bodyLower.includes(screenName);
  }).length;
  return matchCount > 0 && matchCount / newScreens.length >= 0.5;
}

// â�€â�€â�€ GitHub Issues â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

async function fetchExistingIssues(token) {
  // Fetch both open AND closed issues to avoid re-creating closed ones
  const labels = ISSUE_LABELS.join(',');
  const allIssues = [];

  for (const state of ['open', 'closed']) {
    let page = 1;
    const maxPages = 3; // Up to 300 issues per state
    while (page <= maxPages) {
      const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=${state}&labels=${labels}&per_page=100&page=${page}`;
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
          },
        });

        if (!response.ok) {
          console.warn(`  Warning: Could not fetch ${state} issues page ${page} (${response.status})`);
          break;
        }

        const data = await response.json();
        if (data.length === 0) break;

        allIssues.push(...data.map(i => ({
          number: i.number,
          title: i.title,
          body: i.body || '',
          state: i.state,
        })));

        if (data.length < 100) break;
        page++;
      } catch {
        break;
      }
    }
  }

  console.log(`  Found ${allIssues.length} existing issues (open + closed) with matching labels`);
  return allIssues;
}

function isDuplicate(newTitle, newScreens, existingIssues) {
  // Level 1: title similarity (primary signal)
  const titleMatch = existingIssues.find(e => titleSimilar(newTitle, e.title));
  if (titleMatch) return titleMatch;

  // Level 2: title words + body mentions same screens
  // Catches cases where title was rephrased but describes the same screen issue
  for (const existing of existingIssues) {
    const stopWords = new Set(['the', 'a', 'an', 'on', 'in', 'for', 'of', 'is', 'and', 'or', 'vision']);
    const normalize = s => s.toLowerCase().replace(/[[\]()]/g, '').split(/\s+/).filter(w => !stopWords.has(w) && w.length > 2);
    const newWords = normalize(newTitle);
    const existingWords = normalize(existing.title);
    if (newWords.length === 0 || existingWords.length === 0) continue;

    const setExisting = new Set(existingWords);
    const wordOverlap = newWords.filter(w => setExisting.has(w)).length / Math.max(newWords.length, existingWords.length);

    // Partial title overlap (>30%) + same screens in body = likely duplicate
    if (wordOverlap > 0.3 && screenOverlap(newScreens, existing.body)) {
      return existing;
    }
  }

  return null;
}

async function createIssues(issues, existingIssues, token, dryRun) {
  const actionable = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  const actions = [];

  for (const issue of actionable) {
    const issueTitle = `[Vision] ${issue.title}`;

    // Dedup check (title + screens + body)
    const dup = isDuplicate(issue.title, issue.screens, existingIssues);
    if (dup) {
      const stateLabel = dup.state === 'closed' ? 'closed' : 'open';
      actions.push({ action: 'skipped', title: issue.title, reason: `Similar to #${dup.number} (${stateLabel})` });
      console.log(`  ~ Skipped: "${issue.title}" (similar to ${stateLabel} #${dup.number})`);
      continue;
    }

    if (dryRun) {
      actions.push({ action: 'dry-run', title: issue.title });
      console.log(`  - [dry-run] Would create: "${issueTitle}"`);
      continue;
    }

    const body = buildIssueBody(issue);

    try {
      const response = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: issueTitle, body, labels: ISSUE_LABELS }),
      });

      if (response.ok) {
        const created = await response.json();
        actions.push({ action: 'created', number: created.number, title: issue.title });
        console.log(`  + Created #${created.number}: ${issueTitle}`);
      } else {
        const err = await response.text();
        actions.push({ action: 'failed', title: issue.title, error: err.slice(0, 200) });
        console.error(`  x Failed: "${issueTitle}" â€� ${err.slice(0, 200)}`);
      }
    } catch (err) {
      actions.push({ action: 'failed', title: issue.title, error: err.message });
      console.error(`  x Error: "${issueTitle}" â€� ${err.message}`);
    }

    await sleep(1000); // GitHub API rate limit courtesy
  }

  return actions;
}

function buildIssueBody(issue) {
  const screenNames = issue.screens
    .map(s => SCREENS[s]?.name || s)
    .join(', ');

  let body = `## ${issue.severity}: ${issue.title}\n\n`;
  body += `**Category:** ${issue.category}\n`;
  body += `**Screens:** ${screenNames}\n`;
  body += `**Source:** Automated Vision Review Pipeline (GitHub Models API)\n\n`;
  body += `### Findings\n\n`;

  for (const f of issue.findings) {
    const sName = SCREENS[f.screen]?.name || f.screen;
    body += `#### ${sName} (${f.theme})\n\n`;
    body += `- **File:** \`${f.file}\`\n`;
    body += `- **Description:** ${f.description}\n`;
    if (f.wcag) body += `- **WCAG:** ${f.wcag}\n`;
    body += `- **Suggested fix:** ${f.suggestedFix}\n\n`;
  }

  return body;
}

// â�€â�€â�€ Report â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

function writeReport(dir, issues, allFindings, issueActions, model, skippedScreens = []) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of allFindings) counts[f.severity] = (counts[f.severity] || 0) + 1;

  let md = `# Vision UI Audit Report\n\n`;
  md += `> Generated: ${timestamp}\n`;
  md += `> Model: ${model}\n`;
  md += `> Screenshots: ${resolve(dir)}\n`;
  md += `> Total findings: ${allFindings.length}\n\n`;
  if (skippedScreens.length > 0) {
    md += '> **Skipped screens (rate limit):** ' + skippedScreens.join(', ') + '\n';
  }
  md += '\n';

  md += `## Summary\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  md += `| CRITICAL | ${counts.CRITICAL} |\n`;
  md += `| HIGH | ${counts.HIGH} |\n`;
  md += `| MEDIUM | ${counts.MEDIUM} |\n`;
  md += `| LOW | ${counts.LOW} |\n\n`;

  md += `## Issues (${issues.length} groups)\n\n`;
  for (const issue of issues) {
    const screenNames = issue.screens.map(s => SCREENS[s]?.name || s).join(', ');
    md += `### [${issue.severity}] ${issue.title}\n\n`;
    md += `**Category:** ${issue.category} | **Screens:** ${screenNames}\n\n`;

    for (const f of issue.findings) {
      const sName = SCREENS[f.screen]?.name || f.screen;
      md += `- **${sName}** (${f.theme}) â€� ${f.description}`;
      if (f.file) md += ` â†’ \`${f.file}\``;
      if (f.wcag) md += ` (WCAG ${f.wcag})`;
      md += `\n`;
      if (f.suggestedFix) md += `  - Fix: ${f.suggestedFix}\n`;
    }
    md += `\n`;
  }

  if (issueActions.length > 0) {
    md += `## GitHub Issue Actions\n\n`;
    md += `| Action | Issue | Details |\n|--------|-------|---------|\n`;
    for (const a of issueActions) {
      if (a.action === 'created') md += `| Created | #${a.number} | ${a.title} |\n`;
      else if (a.action === 'skipped') md += `| Skipped | â€� | ${a.title} (${a.reason}) |\n`;
      else if (a.action === 'dry-run') md += `| Dry-run | â€� | ${a.title} |\n`;
      else md += `| Failed | â€� | ${a.title} |\n`;
    }
    md += `\n`;
  }

  const reportPath = join(resolve(dir), 'vision-audit-report.md');
  writeFileSync(reportPath, md, 'utf-8');
  return reportPath;
}

// â�€â�€â�€ Model Discovery â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

async function listModels(token) {
  console.log('\nQuerying available models...\n');

  try {
    const response = await fetch('https://models.github.ai/catalog/models', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Could not fetch model catalog (${response.status}).`);
      console.error('Browse models at: https://github.com/marketplace/models');
      return;
    }

    const models = await response.json();
    const visionModels = (Array.isArray(models) ? models : models.models || [])
      .filter(m => {
        const name = (m.name || m.id || '').toLowerCase();
        return name.includes('claude') || name.includes('gpt-4') ||
               name.includes('gpt-5') || name.includes('gemini');
      });

    if (visionModels.length === 0) {
      console.log('No known vision-capable models found in catalog.');
      console.log('Browse all models at: https://github.com/marketplace/models');
      return;
    }

    console.log('Vision-capable models:');
    console.log('');
    for (const m of visionModels) {
      const id = m.id || m.model_id || m.name;
      const publisher = m.publisher || '';
      console.log(`  ${id}  ${publisher ? '(' + publisher + ')' : ''}`);
    }
    console.log('');
    console.log('Use with: --model <id>');
    console.log('Or set:   VISION_MODEL=<id>');
  } catch (err) {
    console.error(`Error querying catalog: ${err.message}`);
    console.error('Browse models at: https://github.com/marketplace/models');
  }
}

// â�€â�€â�€ Main â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€â�€

async function main() {
  const opts = parseCli();

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  const token = resolveToken();

  if (opts.listModels) {
    await listModels(token);
    process.exit(0);
  }

  if (!opts.screenshotDir) {
    console.error('Error: Screenshot directory is required.');
    printUsage();
    process.exit(1);
  }

  const model = opts.model;

  console.log('');
  console.log('============================================================');
  console.log('  Pill O-Clock â€� Automated Vision UI Review');
  console.log('============================================================');
  console.log('');
  console.log(`  Model:       ${model}`);
  console.log(`  Screenshots: ${resolve(opts.screenshotDir)}`);
  console.log(`  Dry run:     ${opts.dryRun ? 'yes' : 'no'}`);

  // Step 1: Load screenshots
  console.log('\n[1/4] Loading screenshots...');
  const screensMap = loadScreenshots(opts.screenshotDir);
  const imageCount = [...screensMap.values()].reduce((n, imgs) => n + Object.keys(imgs).length, 0);
  console.log(`  Found ${imageCount} screenshots across ${screensMap.size} screens`);

  // Step 2: Analyze each screen
  console.log('\n[2/4] Analyzing with AI vision...');
  const allFindings = [];
  const skippedScreens = [];
  const screenKeys = [...screensMap.keys()].sort();
  let screenIdx = 0;

  for (const screenKey of screenKeys) {
    screenIdx++;
    const images = screensMap.get(screenKey);
    const screenName = SCREENS[screenKey]?.name || screenKey;
    process.stdout.write(`  [${screenIdx}/${screenKeys.length}] ${screenName}...`);

    try {
      const findings = await analyzeScreen(screenKey, images, token, model);
      allFindings.push(...findings);

      const counts = {};
      for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
      const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
      console.log(` ${findings.length} findings (${summary || 'none'})`);
    } catch (err) {
      // Rate limit exhausted -- skip this screen and continue
      if (err.rateLimitExhausted) {
        console.log(' SKIPPED (rate limit exhausted)');
        skippedScreens.push(screenName);
        continue;
      }

      console.log(` ERROR: ${err.message}`);

      if (err.status === 401) {
        console.error('\n  Authentication failed. Check your GITHUB_TOKEN and ensure it has models:read scope.');
        process.exit(1);
      }
      if (err.status === 404) {
        console.error(`\n  Model "${model}" not found. Run with --list-models to see available models.`);
        process.exit(1);
      }
    }

    // Rate limit courtesy between screen analyses
    if (screenIdx < screenKeys.length) await sleep(8000);
  }

  if (allFindings.length === 0) {
    console.log('\n  No findings detected. The UI looks clean!');
    process.exit(0);
  }

  // Step 3: Group and create issues
  console.log('\n[3/4] Creating GitHub issues...');
  const issues = groupFindings(allFindings);
  const actionable = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  console.log(`  ${issues.length} issue groups (${actionable.length} CRITICAL/HIGH)`);

  const existingIssues = await fetchExistingIssues(token);
  const issueActions = await createIssues(issues, existingIssues, token, opts.dryRun);

  // Step 4: Write report
  console.log('\n[4/4] Writing report...');
  const reportPath = writeReport(opts.screenshotDir, issues, allFindings, issueActions, model, skippedScreens);
  console.log(`  Report: ${reportPath}`);

  // Final summary
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of allFindings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const created = issueActions.filter(a => a.action === 'created').length;
  const skipped = issueActions.filter(a => a.action === 'skipped').length;

  console.log('');
  console.log('============================================================');
  console.log('  Done!');
  console.log(`  Findings:  ${allFindings.length} total (${counts.CRITICAL} CRITICAL, ${counts.HIGH} HIGH, ${counts.MEDIUM} MEDIUM, ${counts.LOW} LOW)`);
  console.log(`  Issues:    ${created} created, ${skipped} skipped`);
  if (skippedScreens.length > 0) console.log('  Skipped:  ' + skippedScreens.length + ' screens (rate limit): ' + skippedScreens.join(', '));
  console.log(`  Report:    ${reportPath}`);
  console.log('============================================================');
  console.log('');
}

main().catch(err => {
  console.error(`\nFatal error: ${err.message}`);
  if (err.status) console.error(`HTTP status: ${err.status}`);
  process.exit(1);
});
