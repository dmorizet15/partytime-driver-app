#!/usr/bin/env bash
# state.sh — runtime repo state. Every fact computed fresh from git/filesystem at run time.
# Contract: ALWAYS exits 0. Read-only. Pure bash + git (no node). Sections auto-detect;
# an inapplicable section is omitted silently. Core file stays byte-identical across repos —
# per-repo logic lives in scripts/state.local.sh (must define health_checks()).
# Provenance: every contestable value carries its source inline ("value  source").
# Local vs deploy/remote is labeled wherever they can differ (node, migration head).
# A value this script cannot source prints as "unknown" — never a plausible guess.

set +e  # nothing in here is allowed to abort the run

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$ROOT" ] && cd "$ROOT" 2>/dev/null

IN_GIT=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IN_GIT=1

# ---- fetch (fail-soft, ~5s cap, never prompts) --------------------------------
FETCH_STATE=""
if [ "$IN_GIT" = 1 ] && git remote get-url origin >/dev/null 2>&1; then
  GIT_TERMINAL_PROMPT=0 git fetch --quiet >/dev/null 2>&1 &
  fpid=$!
  i=0
  while kill -0 "$fpid" 2>/dev/null && [ "$i" -lt 50 ]; do
    sleep 0.1
    i=$((i + 1))
  done
  if kill -0 "$fpid" 2>/dev/null; then
    kill "$fpid" 2>/dev/null
    FETCH_STATE=stale
  fi
  wait "$fpid" 2>/dev/null
  frc=$?
  if [ -z "$FETCH_STATE" ]; then
    if [ "$frc" -eq 0 ]; then FETCH_STATE=fresh; else FETCH_STATE=stale; fi
  fi
fi

# ---- repo ----------------------------------------------------------------------
echo "── repo ──"
remote_url="$(git remote get-url origin 2>/dev/null)"
if [ -n "$remote_url" ]; then
  repo_name="$(basename "$remote_url" .git)"
  echo "repo:      $repo_name  (origin remote)"
else
  repo_name="$(basename "$PWD")"
  echo "repo:      $repo_name  (directory name — no origin remote)"
fi

if [ -f package.json ]; then
  ver="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -1)"
  if [ -n "$ver" ]; then
    echo "version:   $ver  (package.json)"
  else
    echo "version:   unknown  (package.json present, version not parseable)"
  fi
fi

if [ "$IN_GIT" = 1 ]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [ "$branch" = "HEAD" ]; then
    echo "branch:    (detached @ $(git rev-parse --short HEAD 2>/dev/null))"
  else
    echo "branch:    $branch"
  fi

  # -- the two lines that must never be merged --
  uncommitted="$(git status --porcelain 2>/dev/null | grep -c .)"
  echo ""
  echo "UNCOMMITTED: $uncommitted files"
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"
  if [ -n "$upstream" ]; then
    counts="$(git rev-list --left-right --count "$upstream...HEAD" 2>/dev/null)"
    behind="${counts%%[$'\t' ]*}"
    ahead="${counts##*[$'\t' ]}"
    echo "UNPUSHED:    $ahead commits"
    stale_note=""
    [ "$FETCH_STATE" = "stale" ] && stale_note="   (fetch failed — remote counts may be stale)"
    echo ""
    echo "vs upstream ($upstream): ahead $ahead / behind $behind$stale_note"
  else
    echo "UNPUSHED:    (no upstream — every local commit is unpushed)"
    echo ""
  fi

  # -- divergence vs origin default branch, only off the default branch --
  default_ref="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)"
  if [ -z "$default_ref" ]; then
    git show-ref --verify --quiet refs/remotes/origin/main && default_ref="origin/main"
  fi
  if [ -z "$default_ref" ]; then
    git show-ref --verify --quiet refs/remotes/origin/master && default_ref="origin/master"
  fi
  if [ -n "$default_ref" ] && [ "$branch" != "HEAD" ] && [ "origin/$branch" != "$default_ref" ]; then
    dcounts="$(git rev-list --left-right --count "$default_ref...HEAD" 2>/dev/null)"
    dbehind="${dcounts%%[$'\t' ]*}"
    dahead="${dcounts##*[$'\t' ]}"
    echo "divergence from $default_ref: $dahead ahead / $dbehind behind  (branch divergence — not push backlog)"
  fi

  last="$(git log -1 --format='%h %as %s' 2>/dev/null)"
  [ -n "$last" ] && echo "last commit: $last"
fi

# ---- migrations ----------------------------------------------------------------
if [ -d supabase/migrations ]; then
  head_file="$(ls supabase/migrations/*.sql 2>/dev/null | sort | tail -1)"
  if [ -n "$head_file" ]; then
    echo ""
    echo "── migrations ──"
    echo "head: $(basename "$head_file")  (local files — remote tracker not queried, may diverge)"
    # "next" derives from the NEWEST file only — a max over all files gets polluted by
    # foreign-convention names (e.g. stub files mirrored from another repo).
    # Known conventions: <14-digit-ts>_<seq>_name.sql | <YYYYMMDD>_<seq>_name.sql | <YYYYMMDD><NNN>_name.sql
    hb="$(basename "$head_file")"
    head_seq=""
    case "$hb" in
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*)
        rest="${hb#??????????????_}"
        head_seq="$(printf '%s\n' "$rest" | sed -n 's/^0*\([0-9][0-9]*\)_.*/\1/p')"
        ;;
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*)
        num="${hb%%_*}"
        head_seq="$(printf '%s\n' "${num#????????}" | sed 's/^0*//')"
        [ -z "$head_seq" ] && head_seq=0
        ;;
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*)
        rest="${hb#????????_}"
        head_seq="$(printf '%s\n' "$rest" | sed -n 's/^0*\([0-9][0-9]*\)_.*/\1/p')"
        ;;
    esac
    if [ -n "$head_seq" ] && [ "$head_seq" -lt 100000 ] 2>/dev/null; then
      echo "next: $((head_seq + 1))  (= newest local file's sequence + 1 — remote/out-of-band migrations not counted)"
    else
      echo "next: unknown  (no sequence parseable from newest migration filename)"
    fi
  fi
fi

# ---- toolchain -----------------------------------------------------------------
if [ -f package.json ]; then
  echo ""
  echo "── toolchain ──"
  if command -v node >/dev/null 2>&1; then
    echo "node: $(node -v 2>/dev/null)  (local — not deploy runtime)"
  else
    echo "node: unknown  (not on PATH)"
  fi
  if command -v npm >/dev/null 2>&1; then
    echo "npm:  $(npm -v 2>/dev/null)  (local — not deploy runtime)"
  else
    echo "npm:  unknown  (not on PATH)"
  fi
fi

# ---- env files (git status hides ignored files — surface them) ------------------
env_list="$(ls -a 2>/dev/null | grep '^\.env')"
if [ -n "$env_list" ]; then
  echo ""
  echo "── env files ──"
  printf '%s\n' "$env_list" | while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in
      *.example|*.sample|*.template)
        echo "$f — template (exempt from tracked-in-git check)"
        continue
        ;;
    esac
    if [ "$IN_GIT" = 1 ]; then
      if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
        echo "$f — ⚠ TRACKED IN GIT"
      elif git check-ignore -q "$f" 2>/dev/null; then
        echo "$f — gitignored"
      else
        echo "$f — ⚠ NOT gitignored"
      fi
    else
      echo "$f"
    fi
  done
fi

# ---- per-repo health hook -------------------------------------------------------
if [ -f scripts/state.local.sh ]; then
  # shellcheck disable=SC1091
  . scripts/state.local.sh 2>/dev/null
  if type health_checks >/dev/null 2>&1; then
    echo ""
    echo "── health ──"
    health_checks
  fi
fi

exit 0
