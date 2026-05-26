-- ─────────────────────────────────────────────────────────────────────────────
-- PartyTime Driver App — New East-Region Supabase Migration
-- Script 02: Storage Bucket + Policies
--
-- Run this SECOND in the new project's SQL Editor, after 01_schema.sql.
--
-- Creates the pod-photos bucket as public (matches old project behavior).
-- The driver app uploads via the service role key (server-side only),
-- so only two policies are needed: public read + service-role write.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Create bucket ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-photos', 'pod-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ─── Enable RLS on storage.objects (required for policies to be enforced) ─────
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ─── Public read — anyone can fetch a photo via its public URL ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'pod-photos public read'
  ) THEN
    CREATE POLICY "pod-photos public read"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'pod-photos');
  END IF;
END $$;

-- ─── Service role insert — driver app uploads via service key ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'pod-photos service insert'
  ) THEN
    CREATE POLICY "pod-photos service insert"
      ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'pod-photos');
  END IF;
END $$;

-- ─── Service role update — upsert overwrites existing photo for same stop ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'pod-photos service update'
  ) THEN
    CREATE POLICY "pod-photos service update"
      ON storage.objects
      FOR UPDATE
      USING (bucket_id = 'pod-photos');
  END IF;
END $$;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT id, name, public FROM storage.buckets WHERE id = 'pod-photos';
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';
