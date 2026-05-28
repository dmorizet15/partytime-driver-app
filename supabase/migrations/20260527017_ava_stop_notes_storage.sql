-- Migration 017 — AVA Remembers Storage bucket
-- Photo attachments on ava_stop_notes go here. Bucket is public so direct
-- URLs in photo_urls render in <img> without signed-URL gymnastics — these
-- are operational notes (driveway access, hose location, etc.), not personal
-- data. Driver-side uploads via the anon-key client, gated by an INSERT
-- policy on storage.objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ava-stop-notes',
  'ava-stop-notes',
  true,
  10485760,                                                   -- 10 MB cap
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'ava_stop_notes_authenticated_insert'
  ) THEN
    CREATE POLICY "ava_stop_notes_authenticated_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'ava-stop-notes');
  END IF;

  -- Public bucket already serves anon GETs via the storage REST endpoint;
  -- this policy lets authenticated clients query listings too (used by the
  -- review sheet to render photo thumbnails inside the app).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'ava_stop_notes_authenticated_select'
  ) THEN
    CREATE POLICY "ava_stop_notes_authenticated_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'ava-stop-notes');
  END IF;

  -- Authors can delete their own uploads (defensive cleanup; the writer UI
  -- doesn't expose deletion yet, but we don't want to lock owners out of
  -- their own files). Owner lookup via storage.objects.owner = auth.uid().
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'ava_stop_notes_owner_delete'
  ) THEN
    CREATE POLICY "ava_stop_notes_owner_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'ava-stop-notes' AND owner = auth.uid());
  END IF;
END $$;
