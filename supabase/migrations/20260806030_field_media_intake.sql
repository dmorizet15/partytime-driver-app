-- Migration 030 — Field media intake (driver → marketing)
--
-- Drivers capture a photo or a short clip from a job and it lands here,
-- auto-tagged with the stop / customer / reservation / event it came from.
-- Marketing sweeps it, reviews, and only then promotes an asset to a public
-- post. Nothing here auto-publishes.
--
-- WHY A NEW BUCKET RATHER THAN A PREFIX IN `marketing-media`:
-- `marketing-media` is `public = true`, and public is a BUCKET-WIDE flag —
-- every object in it is readable by anyone holding the URL. These are photos
-- and video of customers' homes and events, so they cannot live there.
-- `field-media-intake` is private; marketing reads it server-side with the
-- service role and mints signed URLs. (Verified live 2026-08-06: the only
-- INSERT policies on `marketing-media` are `TO anon`, so a signed-in driver
-- — role `authenticated` — could not write to it anyway. Postgres roles do
-- not inherit.)
--
-- ⚠ FILE SIZE: a bucket's file_size_limit cannot exceed the PROJECT-WIDE
-- storage upload limit (Dashboard → Project Settings → Storage → "Upload
-- file size limit"). Probed live 2026-08-06 with the service role: 49 MB
-- uploaded 200, 60 MB was rejected `EntityTooLarge` / 413 — the project
-- global was 50 MB. The 500 MB below is inert until that global is raised;
-- resumable (tus) uploads do NOT bypass it. If video uploads start failing
-- at ~50 MB, that global is the thing to check first.
--
-- Prefixes inside the bucket deliberately mirror the public pipeline's
-- (`social/intake/` for photos, `social/video-intake/` for video) so the
-- marketing sweep needs only a bucket-id change plus a signed-URL read.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'field-media-intake',
  'field-media-intake',
  false,
  524288000,                                                  -- 500 MB
  ARRAY[
    -- Photo. iOS file inputs usually transcode HEIC → JPEG, but not always.
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    -- Video. iOS camera capture returns video/quicktime (.mov); Android
    -- returns video/mp4 or, on older devices, video/3gpp.
    'video/mp4','video/quicktime','video/webm','video/3gpp'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- Drivers upload straight from the browser client (same path as
  -- generator-action photos). Bucket-wide rather than per-user-folder: the
  -- real access boundary is that the bucket is private and SELECT is
  -- owner-scoped below.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'field_media_authenticated_insert'
  ) THEN
    CREATE POLICY "field_media_authenticated_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'field-media-intake');
  END IF;

  -- A driver can read back only what they uploaded (storage sets `owner` to
  -- the uploading uid). Deliberately NOT bucket-wide: one driver has no
  -- business reading another driver's customer footage.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'field_media_owner_select'
  ) THEN
    CREATE POLICY "field_media_owner_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'field-media-intake' AND owner = auth.uid());
  END IF;

  -- super_admin can review everything in-app without the service role.
  -- `'super_admin' = ANY(p.roles)` — `profiles.role` does not exist on this
  -- shared DB and errors 42703 (see migs 022–027 + tasks/lessons.md).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'field_media_super_admin_select'
  ) THEN
    CREATE POLICY "field_media_super_admin_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'field-media-intake'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      );
  END IF;

  -- Uploaders can delete their own object. This is what makes "Cancel" on
  -- the in-flight upload chip able to clean up a partially-committed object
  -- instead of orphaning it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'field_media_owner_delete'
  ) THEN
    CREATE POLICY "field_media_owner_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'field-media-intake' AND owner = auth.uid());
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- The companion row. Storage holds bytes; this holds the context that makes
-- an asset usable to marketing without anyone chasing the driver.
--
-- The customer / event columns are a SNAPSHOT, not a live join. TapGoods sync
-- rewrites dispatch_stops (dates drift, orders get renamed, stops get
-- reassigned), and a marketing asset has to record the job as it was on the
-- day it was shot. `stop_id` stays as a pointer for anyone who wants the
-- current truth, and survives the stop being deleted (ON DELETE SET NULL).
--
-- NOTE the three-name rule (CLAUDE.md): a stop carries `company_name` (the
-- TapGoods ORDER name, what every driver screen renders), `customer_name`
-- (the on-site CONTACT) and `client_company` (the ORG). All three are stored
-- because 407 of 958 live stops have a client_company whose text appears
-- nowhere in customer_name.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketing_media_intake (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Where the bytes are. storage_path is UNIQUE and is the idempotency key:
  -- the client uploads first and posts second, so a retried post must not
  -- create a second row.
  storage_bucket   text NOT NULL DEFAULT 'field-media-intake',
  storage_path     text NOT NULL UNIQUE,
  media_type       text NOT NULL CHECK (media_type IN ('photo','video')),
  mime_type        text,
  byte_size        bigint,
  duration_seconds numeric,

  -- Job context.
  stop_id          uuid REFERENCES public.dispatch_stops(id) ON DELETE SET NULL,
  route_id         uuid,
  reservation_id   uuid,

  -- Snapshot of the job as it was when the media was captured.
  company_name     text,
  customer_name    text,
  client_company   text,
  address          text,
  scheduled_date   date,
  event_start      timestamptz,
  event_end        timestamptz,

  -- Who shot it.
  driver_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  driver_name      text,
  caption          text,

  -- Consent. The driver confirms the customer is OK with PTR using this for
  -- marketing before it sends; the timestamp is the record that they did.
  consent_confirmed boolean NOT NULL DEFAULT false,
  consent_at        timestamptz,

  -- Marketing triage. 'new' is the intake queue.
  review_status    text NOT NULL DEFAULT 'new'
                   CHECK (review_status IN ('new','kept','rejected','published')),

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_media_intake_stop_id
  ON public.marketing_media_intake(stop_id);
CREATE INDEX IF NOT EXISTS idx_marketing_media_intake_reservation_id
  ON public.marketing_media_intake(reservation_id);
CREATE INDEX IF NOT EXISTS idx_marketing_media_intake_review_status
  ON public.marketing_media_intake(review_status);
CREATE INDEX IF NOT EXISTS idx_marketing_media_intake_created_at
  ON public.marketing_media_intake(created_at DESC);

ALTER TABLE public.marketing_media_intake ENABLE ROW LEVEL SECURITY;

-- ⚠ THERE IS DELIBERATELY NO INSERT POLICY.
-- Rows are written ONLY by POST /api/media/intake with the service role,
-- which resolves the stop itself and derives every tag column server-side.
-- A driver client never supplies a customer name, so it can never forge one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_media_intake'
      AND policyname='marketing_media_intake_own_read'
  ) THEN
    CREATE POLICY "marketing_media_intake_own_read" ON public.marketing_media_intake
      FOR SELECT TO authenticated
      USING (driver_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_media_intake'
      AND policyname='marketing_media_intake_super_admin_all'
  ) THEN
    CREATE POLICY "marketing_media_intake_super_admin_all" ON public.marketing_media_intake
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      );
  END IF;
END $$;
