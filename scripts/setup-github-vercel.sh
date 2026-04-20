#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PartyTime Driver App — One-shot GitHub + Vercel setup script
# Run this ONCE from the project root after unzipping on your local machine.
#
# Requirements:
#   • GitHub CLI  (https://cli.github.com/)   — install: brew install gh
#   • Vercel CLI  (https://vercel.com/cli)    — install: npm i -g vercel
#   • git (already present on most systems)
#
# Usage:
#   chmod +x scripts/setup-github-vercel.sh
#   ./scripts/setup-github-vercel.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

REPO_NAME="partytime-driver-app"
BRANCH="main"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  PartyTime Driver App — GitHub + Vercel setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Ensure we are in the project root ──────────────────────────────────────
if [ ! -f "package.json" ]; then
  echo "❌  Run this script from the project root (where package.json lives)."
  exit 1
fi

# ── 2. GitHub: check auth ─────────────────────────────────────────────────────
echo "▶  Checking GitHub CLI auth…"
if ! gh auth status &>/dev/null; then
  echo "   Not logged in. Running: gh auth login"
  gh auth login
fi
echo "   ✓ GitHub authenticated"
echo ""

# ── 3. Create GitHub repo (public — change to --private if preferred) ─────────
echo "▶  Creating GitHub repository: $REPO_NAME …"
gh repo create "$REPO_NAME" \
  --public \
  --description "Mobile-first driver route management app for PartyTime Rentals" \
  --source=. \
  --remote=origin \
  --push 2>/dev/null || {
    # Repo may already exist — just set the remote and push
    echo "   (Repo may already exist — setting remote and pushing)"
    git remote remove origin 2>/dev/null || true
    gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  }
echo "   ✓ Pushed to GitHub"

# ── 4. Push tag ───────────────────────────────────────────────────────────────
echo ""
echo "▶  Pushing v1-prototype tag…"
git push origin v1-prototype 2>/dev/null || echo "   (Tag already pushed or skipped)"
echo "   ✓ Tag pushed"

# ── 5. Print GitHub URL ───────────────────────────────────────────────────────
GITHUB_USER=$(gh api user --jq '.login')
GITHUB_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo ""
echo "   GitHub repo: $GITHUB_URL"

# ── 6. Vercel: check auth ─────────────────────────────────────────────────────
echo ""
echo "▶  Checking Vercel CLI auth…"
if ! vercel whoami &>/dev/null; then
  echo "   Not logged in. Running: vercel login"
  vercel login
fi
echo "   ✓ Vercel authenticated"

# ── 7. Deploy to Vercel ───────────────────────────────────────────────────────
echo ""
echo "▶  Deploying to Vercel (preview)…"
echo "   (Accept all prompts — project name: $REPO_NAME, framework: Next.js)"
echo ""
VERCEL_URL=$(vercel deploy --yes 2>&1 | grep -E "https://" | tail -1)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅  All done!"
echo ""
echo "  GitHub:  $GITHUB_URL"
echo "  Vercel:  $VERCEL_URL"
echo "  Branch:  $BRANCH"
echo "  Tag:     v1-prototype"
echo "═══════════════════════════════════════════════════════════"
echo ""
