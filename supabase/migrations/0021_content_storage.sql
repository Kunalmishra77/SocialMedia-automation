-- ============================================================
-- 0021_content_storage.sql — public storage bucket for scheduled content media
-- Instagram's publish API requires a PUBLIC media URL, so the bucket is public-read.
-- Uploads/deletes go through server actions (service role), so no write policy needed.
-- Idempotent.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-media', 'content-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read (so graph.instagram.com can fetch the media).
DROP POLICY IF EXISTS content_media_public_read ON storage.objects;
CREATE POLICY content_media_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'content-media');
