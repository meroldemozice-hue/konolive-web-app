ALTER TABLE public.internal_messages ADD COLUMN IF NOT EXISTS audio_url text;

-- Update the constraint to include audio_url
ALTER TABLE public.internal_messages DROP CONSTRAINT IF EXISTS content_or_image;
ALTER TABLE public.internal_messages ADD CONSTRAINT content_or_image_or_audio CHECK (content IS NOT NULL OR image_url IS NOT NULL OR audio_url IS NOT NULL);

-- Add DELETE policy
CREATE POLICY "Users can delete internal messages"
  ON public.internal_messages FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
