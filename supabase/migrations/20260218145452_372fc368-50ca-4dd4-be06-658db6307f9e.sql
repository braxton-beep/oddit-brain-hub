
CREATE TABLE public.brain_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  prompt text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view brain_prompts"
  ON public.brain_prompts FOR SELECT USING (true);

CREATE POLICY "Anyone can insert brain_prompts"
  ON public.brain_prompts FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update brain_prompts"
  ON public.brain_prompts FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete brain_prompts"
  ON public.brain_prompts FOR DELETE USING (true);

CREATE TRIGGER update_brain_prompts_updated_at
  BEFORE UPDATE ON public.brain_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
