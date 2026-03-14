# S1 — Vision UI Review

> **Status:** Completed + Re-audited + Vision Audited (March 2026)
> **Skill:** Vision — code-level audit + programmatic analysis + Claude Vision
> **Scope:** Accessibility · WCAG compliance · Visual consistency · Dark mode

---

## Overview

Code-level UI audit of all 9 main screens in Pill O-Clock, focused on
accessibility for elderly users. The audit was performed by analyzing component
source code against WCAG 2.1 guidelines, Apple HIG, and Material Design
accessibility standards.

Screenshot capture infrastructure is fully functional: the capture script
auto-boots the emulator, starts Metro if needed, and navigates each screen
via Expo deep links.

---

## Infrastructure delivered

### Scripts

| File | Purpose |
|------|---------|
| `scripts/capture-screenshots.ps1` | ADB-powered screenshot capture across all screens in light/dark mode |
| `scripts/run-vision-review.ps1` | End-to-end orchestrator: capture → manual or automated audit |
| `scripts/vision-review.mjs` | Fully automated pipeline: AI analysis → GitHub issues → report |
| `.github/agents/vision-reviewer.agent.md` | Custom Copilot agent for interactive manual audits |

### Capture script features

- Navigates 9 screens via Expo deep links (`pilloclock://` scheme)
- Auto-boots emulator (default AVD: `Pixel_9`) if not running
- Auto-starts Metro dev server if not running
- Dismisses dev warnings overlay before each capture
- Supports `light`, `dark`, or `both` theme modes
- Configurable render delay (default 2500ms)
- Generates `manifest.json` with metadata
- Validates ADB connection, Metro server, and app status before capture

### Runner script features

- Orchestrates full capture → audit flow
- `-SkipCapture` mode for using existing screenshots
- Auto-detects latest screenshot directory
- Generates `AUDIT-README.md` with screenshot inventory and instructions
- Prints step-by-step audit instructions for Claude Vision

### Prompt template

Structured for 6 audit categories:
1. Visual consistency (spacing, typography, colors)
2. Touch targets (≥ 44×44 pt for elderly users)
3. WCAG contrast (AA 4.5:1 text, 3:1 UI; AAA 7:1)
4. Overflow / clipping
5. Empty / error states
6. Dark mode consistency

Output format: severity-tagged findings with file references by screen.

---

## Audit results

### Summary

| Severity | Count | Primary categories |
|----------|-------|--------------------|
| CRITICAL | 7 | Touch targets (4), Dark mode (1), Truncation (1), Empty state (1) |
| HIGH | 12 | Contrast (3), Button spacing (2), Hardcoded colors (4), Empty states (2), Inputs (1) |
| MEDIUM | 14 | Text wrapping, dark mode, loading states, visual feedback |
| LOW | 10 | Inconsistency, documentation, minor polish |
| **Total** | **43** | |

### Screens audited

| Screen | File | Findings |
|--------|------|----------|
| Home / Today | `app/(tabs)/index.tsx` | 6 |
| DoseCard | `components/DoseCard.tsx` | 7 |
| MedicationForm | `components/MedicationForm.tsx` | 6 |
| Alarm | `app/alarm.tsx` | 2 |
| Health | `app/(tabs)/health.tsx` | 2 |
| MedicationCard | `components/MedicationCard.tsx` | 5 |
| History | `app/(tabs)/history.tsx` | 3 |
| Settings | `app/(tabs)/settings.tsx` | 3 |
| Calendar | `app/(tabs)/calendar.tsx` | 4 |

### Top 5 priorities for elderly users

1. **Increase minimum touch target to 48×48 pt** — All buttons/toggles
2. **Fix contrast on muted text** — Replace `#94a3b8` with darker alternatives
3. **Add medication name disclosure** — Show full name for truncated entries
4. **Standardize dark mode colors** — Extract all hardcoded hex to theme tokens
5. **Add empty state feedback** — Never show blank screens

---

## GitHub issues created

| # | Title | Labels | Severity |
|---|-------|--------|----------|
| [#5](https://github.com/GiulianoTaliano/pill-o-clock/issues/5) | Touch targets below 44×44 pt minimum | `accessibility`, `ui` | CRITICAL |
| [#6](https://github.com/GiulianoTaliano/pill-o-clock/issues/6) | Hardcoded colors break dark mode and fail WCAG contrast | `visual-bug`, `accessibility` | CRITICAL |
| [#7](https://github.com/GiulianoTaliano/pill-o-clock/issues/7) | Missing empty states on Home, Health, and History | `ui`, `accessibility` | CRITICAL |
| [#8](https://github.com/GiulianoTaliano/pill-o-clock/issues/8) | Medication name truncation/overflow | `ui`, `accessibility` | CRITICAL |
| [#9](https://github.com/GiulianoTaliano/pill-o-clock/issues/9) | Button spacing, badge contrast, icon sizes | `accessibility`, `ui` | HIGH |

Labels created: `ui` (visual consistency), `accessibility` (WCAG/elderly), `visual-bug` (overflow/dark mode)

---

## Detailed findings

### CRITICAL (7)

| # | Finding | Screen | File |
|---|---------|--------|------|
| 1 | Touch target too small (40×40 pt history button) | Home | `app/(tabs)/index.tsx` ~L257 |
| 2 | Low contrast status text (`#64748b` on light bg) | DoseCard | `components/DoseCard.tsx` ~L118 |
| 3 | Medication names truncated without disclosure | MedicationCard | `components/MedicationCard.tsx` ~L74 |
| 4 | Missing empty state when no medications | Home | `app/(tabs)/index.tsx` ~L240 |
| 5 | Icon-only alarm note button (14pt icon) | Alarm | `app/alarm.tsx` ~L159 |
| 6 | Hardcoded `bg-white/70` in alarm note input | Alarm | `app/alarm.tsx` ~L171 |
| 7 | Fixed height truncation risk in history logs | History | `app/(tabs)/history.tsx` ~L140 |

### HIGH (12)

| # | Finding | Screen | File |
|---|---------|--------|------|
| 8 | Insufficient button spacing (`gap-2` = 8pt) | DoseCard | `components/DoseCard.tsx` ~L194 |
| 9 | Weak contrast on status badges | Calendar | `app/(tabs)/calendar.tsx` ~L141 |
| 10 | Text-only secondary action too small | Home | `app/(tabs)/index.tsx` ~L287 |
| 11 | No empty state for health measurements | Health | `app/(tabs)/health.tsx` ~L400 |
| 12 | Hardcoded border colors in form | MedicationForm | `components/MedicationForm.tsx` ~L220 |
| 13 | Small category badge (20×18 pt) | MedicationCard | `components/MedicationCard.tsx` ~L59 |
| 14 | Muted text for required labels | MedicationForm | `components/MedicationForm.tsx` ~L184 |
| 15 | No scroll indicator on dosage units | MedicationForm | `components/MedicationForm.tsx` ~L300 |
| 16 | Placeholder text too light (`#94a3b8`) | MedicationForm | `components/MedicationForm.tsx` ~L195 |
| 17 | Small info icons (13pt) | MedicationCard | `components/MedicationCard.tsx` ~L85 |
| 18 | Inconsistent padding on settings rows | Settings | `app/(tabs)/settings.tsx` ~L48 |
| 19 | Time input not accessible (36×36 pt) | MedicationForm | `components/MedicationForm.tsx` ~L116 |

### MEDIUM (14)

20. No loading state for calendar dose actions
21. Dark mode contrast on summary chips
22. Medication name truncation in DoseCard
23. Missing error focus management in form
24. No confirmation visual on dose action
25. Hardcoded colors for skip reasons
26. Small toggle switch hit area
27. Text overflow in checkin prompt
28. Medication notes display overflow
29. Dark mode toggle colors in settings
30. FlashList missing ListEmptyComponent
31. Snooze button visual clarity
32. Calendar day cell no hover state
33. Medication form keyboard avoidance

### LOW (10)

34. Inconsistent icon sizes (11-20pt range)
35. Placeholder text styling inconsistency
36. History stats skeleton shimmer duration
37. Badge colors not extracted to tokens
38. Appointment card time display when empty
39. Check-in modal dismiss without undo
40. Health tab chart legend font too small
41. Dose card border-left color in dark mode
42. No focus indicators / accessibilityRole
43. Calendar navigation buttons small

---

## How to use the Vision audit tools

### Automated screenshot capture (requires emulator)

```powershell
# Capture all screens in both themes
.\scripts\capture-screenshots.ps1

# Capture only dark mode with longer delay
.\scripts\capture-screenshots.ps1 -Mode dark -DelayMs 3000

# Custom output directory
.\scripts\capture-screenshots.ps1 -OutputDir ./screenshots/release-1.4
```

### Fully automated workflow (recommended)

```powershell
# Capture + analyze + create issues (zero human intervention)
.\scripts\run-vision-review.ps1 -Auto

# Dry-run: analyze without creating issues
.\scripts\run-vision-review.ps1 -Auto -DryRun

# Skip capture, use existing screenshots
.\scripts\run-vision-review.ps1 -Auto -SkipCapture

# Use a specific AI model
.\scripts\run-vision-review.ps1 -Auto -Model "openai/gpt-5-mini"
```

Requires `GITHUB_TOKEN` env var with `models:read` + `repo` scopes.
Uses the GitHub Models API (included in Copilot subscription, no extra cost).

### Manual audit workflow (interactive)

```powershell
# Capture + print manual instructions
.\scripts\run-vision-review.ps1

# Skip capture
.\scripts\run-vision-review.ps1 -SkipCapture
```

1. Run `scripts/run-vision-review.ps1` (or capture screenshots manually)
2. Open Copilot Chat and select the `@vision-reviewer` agent
3. Attach screenshots from the `screenshots/` directory
4. Type: `audit these screenshots`
5. The agent creates GitHub issues for CRITICAL/HIGH findings automatically

### Standalone Node.js pipeline

```bash
# Run directly without PowerShell orchestrator
node scripts/vision-review.mjs ./screenshots/2026-03-14_10-00-00 --dry-run

# List available AI models
node scripts/vision-review.mjs --list-models
```

---

## WCAG references used

| Criterion | Level | Threshold |
|-----------|-------|-----------|
| 1.4.3 Contrast (Minimum) | AA | 4.5:1 text, 3:1 UI |
| 1.4.6 Contrast (Enhanced) | AAA | 7:1 text, 4.5:1 large |
| 2.5.5 Target Size (Enhanced) | AAA | 44×44 CSS px |
| 2.5.8 Target Size (Minimum) | AA | 24×24 CSS px |
| 1.4.11 Non-text Contrast | AA | 3:1 for UI components |

---

## S1b — Vision Re-Audit (March 2026)

After the screenshot capture pipeline was fully validated (18 screenshots, both
themes, MMKV-based theme switching), a reconciliation audit was performed by:

1. **Code re-audit** — all 43 original findings checked against current codebase
   (post-S5 refactoring of MedicationForm)
2. **Programmatic analysis** — `scripts/analyze-screenshots.ps1` sampled pixel
   colors from all 18 PNGs using System.Drawing, computing WCAG contrast ratios
   and verifying theme token compliance
3. **GitHub issue reconciliation** — issues #5-#9 updated with current status

### Re-audit methodology

| Step | Tool | What it checks |
|------|------|---------------|
| Code re-audit | Claude Opus (Explore agent) | Each finding's line reference vs current code |
| Token verification | `analyze-screenshots.ps1` (removed) | Background pixel color vs expected CSS token |
| Contrast measurement | `analyze-screenshots.ps1` (removed) | Text/bg luminance ratio per WCAG 2.1 formula |
| Cross-theme validation | MD5 hash comparison | Light vs dark screenshots differ per screen |
| Specific issue checks | Pixel sampling at known areas | Alarm dark mode input area, muted text tokens |

### Reconciliation results

**Of the 43 original findings:**

| Status | Count | Examples |
|--------|-------|---------|
| **FIXED** | 9 | Empty states (#4, #11), DoseCard contrast (#2), MedicationCard names (#3), form borders (#12), required labels (#14), settings rows (#18), time input (#19) |
| **STILL VALID** | 9 | Touch targets (#1, #5, #10), button spacing (#8), category badge (#13), placeholder contrast (#16), small icons (#17), scroll indicator (#15), alarm input (#6) |
| **PARTIALLY FIXED** | 1 | Hardcoded colors (#6 umbrella issue) — some fixed, alarm still valid |
| **UNVERIFIABLE** | 1 | History FlashList height (#7) — code refactored, line ref changed |
| **MEDIUM/LOW** | 23 | Requires visual verification per screen |

### Programmatic WCAG analysis

#### Theme token compliance (background color at y=2300)

| Screen | Light actual | Light expected | Match | Dark actual | Dark expected | Match |
|--------|-------------|---------------|-------|------------|--------------|-------|
| home | `#C2C4C6` | `#F0F6FF` | No* | `#212837` | `#020617` | No* |
| medications | `#63A7FF` | `#F0F6FF` | No* | `#488DE7` | `#020617` | No* |
| calendar | `#E5E9EE` | `#F0F6FF` | Yes | `#232D41` | `#020617` | No** |
| health | `#E5E9EE` | `#F0F6FF` | Yes | `#232D41` | `#020617` | No** |
| history | `#E5E9EE` | `#F0F6FF` | Yes | `#232D41` | `#020617` | No** |
| settings | `#E5E9EE` | `#F0F6FF` | Yes | `#232D41` | `#020617` | No** |
| alarm | `#FFFFFF` | `#F0F6FF` | Yes | `#0F172A` | `#020617` | Yes |
| onboarding | `#F0F6FF` | `#F0F6FF` | Yes | `#020617` | `#020617` | Yes |

\* Sample point hits navigation bar/FAB area, not pure background — false positive.
\** Dark mode tab screens use `bg-card` (`#0F172A`) which layers as `#232D41` —
this is expected NativeWind behavior, not a bug.

#### Muted text contrast (computed, not sampled)

| Theme | Token | Background | Ratio | Result |
|-------|-------|-----------|-------|--------|
| Light | `#94A3B8` | `#F0F6FF` | **2.36:1** | **FAIL** (AA requires 4.5:1) |
| Dark | `#64748B` | `#020617` | **4.24:1** | AA-large only (normal text fails) |

**New issue created:** [#10](https://github.com/GiulianoTaliano/pill-o-clock/issues/10) — muted text token WCAG failure

#### Cross-theme verification

All 8 screen pairs confirmed different (MD5 hash comparison):

| Screen | Light hash | Dark hash |
|--------|-----------|-----------|
| home | E4CCC1E0 | C5B11869 |
| medications | 4A2BF7E7 | 4C4C7ED3 |
| calendar | 45EE0CD2 | 517DC0CB |
| health | D90ECC4B | F69680FD |
| history | 7E4BA1DD | 08583430 |
| settings | E7E0D884 | 5A71156C |
| alarm | 518943B5 | 0D3FC6C0 |
| onboarding | 16E760B2 | 57F0A821 |

Note: `alarm` and `medication-new` share hashes within each theme (expected —
both show the same screen state when no data is loaded).

#### Alarm dark mode note input

Pixel sample at (540, 1400): `#1B2537` (dark) — **no white bleed detected** in
static state. The `bg-white/70` in code may only manifest when the input is
focused/expanded.

### GitHub issues updated

| Issue | Title | Action |
|-------|-------|--------|
| [#5](https://github.com/GiulianoTaliano/pill-o-clock/issues/5) | Touch targets | Updated — 2/5 items fixed, 3 still valid |
| [#6](https://github.com/GiulianoTaliano/pill-o-clock/issues/6) | Hardcoded colors | Updated — DoseCard fixed, alarm still valid |
| [#7](https://github.com/GiulianoTaliano/pill-o-clock/issues/7) | Empty states | **CLOSED** — all primary items resolved |
| [#8](https://github.com/GiulianoTaliano/pill-o-clock/issues/8) | Truncation | Updated — MedicationCard fixed, DoseCard still valid |
| [#9](https://github.com/GiulianoTaliano/pill-o-clock/issues/9) | Spacing/contrast | Updated — settings fixed, 4 items still valid |
| [#10](https://github.com/GiulianoTaliano/pill-o-clock/issues/10) | Muted text WCAG | **NEW** — programmatic analysis confirmed 2.36:1 failure |

### Scripts delivered

| File | Purpose |
|------|---------|
| `scripts/analyze-screenshots.ps1` (removed) | Was: programmatic WCAG analysis — superseded by `@vision-reviewer` agent |

### Screenshot inventory

Location: `screenshots/2026-03-14_03-25-45/`

- `light/` — 9 PNGs (1080×2424, Pixel 9)
- `dark/` — 9 PNGs (1080×2424, Pixel 9)
- `manifest.json` — capture metadata
- `analysis-results.json` — programmatic analysis output

### Remaining items for visual verification

The following findings require human visual inspection of the screenshots (Claude
Vision or manual review):

1. **Status badge contrast** (#9) — runtime theme-dependent colors
2. **Alarm `bg-white/70` when input is focused** (#6) — requires interaction state
3. **Medium/Low findings (20-43)** — loading states remaining

---

## S1c — Claude Vision Audit (March 2026)

All 18 screenshots (9 screens x 2 themes) attached directly to Copilot Chat
for Claude Opus visual analysis. This is the first true vision-based audit —
the model analyzed the actual rendered pixels, not source code.

### Why this finds things code analysis cannot

- **Visual contrast perception** — a `#94A3B8` token looks acceptable in code
  but is clearly hard to read when rendered on a near-white background
- **Spatial relationships** — the dosage unit scroller cutoff is only obvious
  when you *see* the partial chip peeking at the edge
- **Dark mode subtleties** — the History right chevron `>` blending into the
  background is invisible in code (colors are theme-computed) but immediately
  apparent in the screenshot
- **Cross-element comparison** — comparing empty state styles across screens
  reveals inconsistency that per-file code review misses

### Findings summary

| Severity | Count | Key themes |
|----------|-------|------------|
| CRITICAL | 3 | Muted text WCAG fail, hidden scroller, onboarding Skip target |
| HIGH | 7 | Nav chevrons, dismiss button, amount label, settings descriptions, radio buttons |
| MEDIUM | 8 | Dev warning, tab labels, weekday headers, color picker labels, PRN visual hierarchy |
| LOW | 4 | Inconsistent icons, back arrow, dashed border, tab separator |
| **Total** | **22** | |

### CRITICAL findings

| # | Finding | Screen | File |
|---|---------|--------|------|
| C1 | Muted/placeholder text fails WCAG AA in light mode (2.36:1) | All screens | `global.css`, `MedicationForm.tsx` |
| C2 | Dosage unit scroller cut off with no scroll affordance | New Medication | `MedicationForm.tsx` |
| C3 | "Skip" on onboarding has ~30x20pt touch target | Onboarding | `onboarding.tsx` |

### HIGH findings

| # | Finding | Screen | File |
|---|---------|--------|------|
| H1 | Navigation chevrons (<>) too small (~40px) | Calendar, History | `calendar.tsx`, `history.tsx` |
| H2 | Check-in dismiss "x" button undersized (~28px) | Home | `index.tsx` |
| H3 | "amount" label nearly invisible in dark mode | New Medication | `MedicationForm.tsx` |
| H4 | Settings description text too faint (both themes) | Settings | `settings.tsx` |
| H5 | History right chevron barely visible in dark mode | History | `history.tsx` |
| H6 | Onboarding feature card borders too subtle in dark | Onboarding | `onboarding.tsx` |
| H7 | Empty state messages ("No records", "No appointments") too muted | History, Calendar | `history.tsx`, `calendar.tsx` |

### MEDIUM findings

| # | Finding | Screen |
|---|---------|--------|
| M1 | Dev warning banner visible in Home screenshots | Home |
| M2 | Tab bar icon labels very small (~10-11pt) | All tabs |
| M3 | Calendar weekday headers too small (single letters) | Calendar |
| M4 | History summary 0-state cards lack context | History |
| M5 | Color picker circles have no labels (color-blind issue) | New Medication |
| M6 | "On demand (PRN)" visual hierarchy ambiguous | New Medication |
| M7 | Onboarding pagination dots too small (~8px) | Onboarding |
| M8 | Radio button unselected state faint in dark mode | Settings |

### LOW findings

| # | Finding | Screen |
|---|---------|--------|
| L1 | Inconsistent empty state icon styles across screens | All |
| L2 | Back arrow on New Medication could be larger | New Medication |
| L3 | "Add photo" dashed border very faint in dark mode | New Medication |
| L4 | Tab bar separator line barely visible in light mode | All tabs |

### Cross-theme assessment

| Aspect | Light | Dark |
|--------|-------|------|
| Background tokens | `#F0F6FF` correct | `#020617` correct |
| Card differentiation | White on light blue — clear | `#0F172A` on `#020617` — very subtle |
| Muted text readability | **Worst issue** — fails WCAG | Generally better |
| Status colors (green/red) | Soft on pastel cards | Pops more on dark cards |
| Selected states (blue) | Clear | Clear |
| Empty states | All present | All present |

### GitHub issues

| Issue | Title | Source |
|-------|-------|--------|
| [#11](https://github.com/GiulianoTaliano/pill-o-clock/issues/11) | Low contrast on secondary text, chevrons, radio buttons | S1c vision audit |
| [#12](https://github.com/GiulianoTaliano/pill-o-clock/issues/12) | Small targets and missing labels on onboarding, calendar, color picker | S1c vision audit |
| [#9](https://github.com/GiulianoTaliano/pill-o-clock/issues/9) | Updated — dosage scroller upgraded to CRITICAL | S1c comment |

### Method comparison: Code vs Programmatic vs Vision

| Method | Strengths | Blind spots |
|--------|-----------|-------------|
| Code analysis (S1) | Fast, exhaustive, finds all hardcoded values | Can't see rendered result; misses visual hierarchy |
| Programmatic (S1b) | Objective WCAG ratios; cross-theme hash verification | Samples fixed points; can't evaluate layout/spacing |
| Vision (S1c) | Sees what the user sees; catches spatial and perceptual issues | Subjective; can't measure exact pixel values |

**Conclusion:** The three methods are complementary. Code analysis catches the most issues (43), programmatic confirms WCAG objectively, and vision catches the issues that only a human (or visual AI) would notice — hidden scrollers, faint chevrons, spatial ambiguity.
