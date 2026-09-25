CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  role text NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);
CREATE INDEX ai_chat_messages_user_created ON public.ai_chat_messages (user_id, created_at);
GRANT SELECT, DELETE ON public.ai_chat_messages TO authenticated;
GRANT ALL ON public.ai_chat_messages TO service_role;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai messages read" ON public.ai_chat_messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own ai messages delete" ON public.ai_chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid());