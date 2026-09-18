# Release & Versioning Workflow

<callout icon="♞">**Status:** Active · **Owner:** Gen · **Last Reviewed:** 2026-08-09</callout>

This document specifies the official Git branching strategy, changelog maintenance standards, version tagging procedures, and automated deployment pipelines for the portfolio codebase.

---

## 1. Overview & Branching Strategy

The repository follows a trunk-based / feature-branch workflow:

- **`main` Branch**: Production branch. Every push or merged PR to `main` triggers automated Cloudflare Pages production deployment after passing all CI gates.
- **Feature & Fix Branches** (e.g. `bug-fixes`, `feature/section-02-mobile`): Working branches where active changes are developed, verified, and reviewed before merging into `main`.

---

## 2. The 2-Tier Versioning Flow

```
Feature / Fix Branch  ──►  Log under [Unreleased]  ──►  PR & Merge to main  ──►  Auto-Deploy
                                                                                  │
                                                When cutting a Release Milestone  ▼
                                                 Update package.json (1.2.0)
                                                 Move [Unreleased] ──► [1.2.0]
                                                 Git Tag (v1.2.0) & Push Tags
```

### Tier 1: Daily Task Flow (Every Commit)

When working on a feature or fixing a bug on a branch (e.g. `bug-fixes`):

1. **Develop & Test**: Implement the changes locally and run the verification suite (`pnpm run format`, `pnpm run lint`, `pnpm run check`, `pnpm run build`).
2. **Document Unreleased Changes**: Record each fix or feature under the `## [Unreleased]` section at the top of [`docs/Changelog.md`](../Changelog.md).
3. **Commit & Push**:
   ```bash
   git add .
   git commit -m "fix(mobile): resolve horizontal page overflow in section 02"
   git push origin bug-fixes
   ```
4. **Merge to `main`**: Create a Pull Request or merge the branch into `main`. Cloudflare Pages will automatically deploy the update live to production.

---

### Tier 2: Milestone Version Release (Cutting a Version Tag)

When a batch of features or fixes is complete and ready for an official versioned release (e.g. `v1.2.0`):

#### Step 1: Update `docs/Changelog.md`

Move all items from `## [Unreleased]` into a new version header with today's date, and re-create an empty `## [Unreleased]` header at the top:

```markdown
## [Unreleased]

## [1.2.0] - 2026-08-09

### Added

- Production Live GitHub Contributions Edge API (`/api/github/contributions.json`).
- Daily 12:00 AM UTC rebuild cron in GitHub Actions (`.github/workflows/ci.yml`).

### Fixed

- Adapted GitHub contribution grid mobile responsiveness with zero horizontal scroll.
- Adapted Section 02 mobile card width, touch swiping, and sticky scrolljacking scoping.
- Fixed `Hover for Photo` text wrapping into two lines on mobile avatar cards.
- Replaced system text warning emojis with `blunder.svg` vector SVG icon.
```

#### Step 2: Update `package.json` Version

Update the `"version"` field in [`package.json`](../../package.json) to match the release version:

```json
{
  "name": "peaceful-proxima",
  "version": "1.2.0"
}
```

> **Note**: The desktop sidebar footer version string in [`src/layouts/BaseLayout.astro`](../../src/layouts/BaseLayout.astro) is dynamically bound to `package.json` (`v{pkg.version}`). Updating `package.json` automatically updates the site UI footer across all pages!

#### Step 3: Run Full Verification Suite

Ensure all CI gates pass clean:

```bash
npx pnpm run format
npx pnpm run lint
npx pnpm run check
npx pnpm run build
# Note: If Git Bash cannot be used (e.g. PowerShell), wrap with cmd /c "..."
```

#### Step 4: Commit & Tag the Release

Commit the version bump and create an annotated Git tag:

```bash
# 1. Commit the release bump
git commit -am "chore(release): release v1.2.0"

# 2. Merge to main (if on feature branch)
git checkout main
git merge bug-fixes

# 3. Create annotated Git tag
git tag -a v1.2.0 -m "Release v1.2.0 - Mobile Responsiveness & Edge API"

# 4. Push main branch and tags to GitHub
git push origin main --tags
```

---

## 3. Automated CI/CD & Deployment

- **Cloudflare Pages**: Automatically detects pushes to `main` and builds the production static bundle.
- **Daily Rebuild Cron**: A scheduled GitHub Actions workflow runs at **12:00 AM UTC daily** (`0 0 * * *` in `.github/workflows/ci.yml`) to trigger fresh daily SSG builds for initial HTML hydration.
- **Edge API Cache**: Live edge endpoint `/api/github/contributions.json` caches GitHub responses for 1 hour (`max-age=3600`), updating production contribution data live on client hydration.

---

## 4. Definition of Done Checklist

Before pushing a release, verify that:

- [ ] No system text emojis are used (only vector SVGs via `<DoodleIcon>` or raw SVGs).
- [ ] No broken local markdown links exist (`pnpm run check-links` passes).
- [ ] `package.json` version matches the newest release tag in [`docs/Changelog.md`](../Changelog.md).
- [ ] Full verification suite passes clean with 0 errors.
