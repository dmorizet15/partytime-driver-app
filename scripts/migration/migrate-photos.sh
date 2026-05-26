#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PartyTime Driver App — Pod Photo Migration
# Copies all objects from pod-photos bucket in old Supabase project to new one.
#
# Usage:
#   export OLD_URL="https://OLD-REF.supabase.co"
#   export OLD_KEY="your-old-service-role-key"
#   export NEW_URL="https://NEW-REF.supabase.co"
#   export NEW_KEY="your-new-service-role-key"
#   chmod +x scripts/migration/migrate-photos.sh
#   ./scripts/migration/migrate-photos.sh
#
# Safe to re-run — uploads use x-upsert:true so duplicates are overwritten.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

OLD_URL="${OLD_URL:?Set OLD_URL to the old Supabase project URL}"
OLD_KEY="${OLD_KEY:?Set OLD_KEY to the old service role key}"
NEW_URL="${NEW_URL:?Set NEW_URL to the new Supabase project URL}"
NEW_KEY="${NEW_KEY:?Set NEW_KEY to the new service role key}"

BUCKET="pod-photos"
TMPDIR_BASE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BASE"' EXIT

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Pod Photo Migration: old → new Supabase project"
echo "  Old: $OLD_URL"
echo "  New: $NEW_URL"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── List all objects in old bucket ───────────────────────────────────────────
echo "▶  Listing objects in old bucket..."
LIST_RESPONSE=$(curl -sf \
  "${OLD_URL}/storage/v1/object/list/${BUCKET}" \
  -X POST \
  -H "Authorization: Bearer ${OLD_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"","limit":10000,"sortBy":{"column":"name","order":"asc"}}')

OBJECT_NAMES=$(echo "$LIST_RESPONSE" | python3 -c "
import json, sys
items = json.load(sys.stdin)
for item in items:
    if item.get('name'):
        print(item['name'])
" 2>/dev/null || echo "$LIST_RESPONSE" | grep -oP '\"name\":\s*\"\K[^\"]+' || true)

if [[ -z "$OBJECT_NAMES" ]]; then
  echo "   No objects found in old bucket (or bucket is empty). Nothing to migrate."
  exit 0
fi

TOTAL=$(echo "$OBJECT_NAMES" | wc -l | tr -d ' ')
echo "   Found ${TOTAL} object(s)."
echo ""

# ── Migrate each object ───────────────────────────────────────────────────────
COUNT=0
FAILED=0

while IFS= read -r name; do
  [[ -z "$name" ]] && continue

  SAFE_NAME="${name//\//__}"
  LOCAL_FILE="${TMPDIR_BASE}/${SAFE_NAME}"

  # Download from old project (authenticated — more reliable than public URL path)
  HTTP_STATUS=$(curl -sf \
    "${OLD_URL}/storage/v1/object/${BUCKET}/${name}" \
    -H "Authorization: Bearer ${OLD_KEY}" \
    -o "$LOCAL_FILE" \
    -w "%{http_code}" 2>/dev/null || echo "000")

  if [[ "$HTTP_STATUS" != "200" ]] || [[ ! -s "$LOCAL_FILE" ]]; then
    echo "   ✗ DOWNLOAD FAILED (HTTP ${HTTP_STATUS}): ${name}"
    FAILED=$((FAILED + 1))
    rm -f "$LOCAL_FILE"
    continue
  fi

  # Upload to new project
  UP_STATUS=$(curl -sf -X POST \
    "${NEW_URL}/storage/v1/object/${BUCKET}/${name}" \
    -H "Authorization: Bearer ${NEW_KEY}" \
    -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" \
    --data-binary @"$LOCAL_FILE" \
    -w "%{http_code}" \
    -o /dev/null 2>/dev/null || echo "000")

  rm -f "$LOCAL_FILE"

  if [[ "$UP_STATUS" =~ ^2 ]]; then
    COUNT=$((COUNT + 1))
    echo "   ✓ [${COUNT}/${TOTAL}] ${name}"
  else
    echo "   ✗ UPLOAD FAILED (HTTP ${UP_STATUS}): ${name}"
    FAILED=$((FAILED + 1))
  fi

done <<< "$OBJECT_NAMES"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [[ $FAILED -eq 0 ]]; then
  echo "  ✅  Migration complete. ${COUNT}/${TOTAL} photos migrated."
else
  echo "  ⚠️   Migration finished with errors."
  echo "  Succeeded: ${COUNT}  |  Failed: ${FAILED}  |  Total: ${TOTAL}"
  echo "  Re-run the script — uploads are idempotent (x-upsert: true)."
  exit 1
fi
echo "═══════════════════════════════════════════════════════════"
echo ""
