
-- Create table for storing @itsOddit tweet history
CREATE TABLE public.twitter_tweets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  created_at_twitter TIMESTAMP WITH TIME ZONE,
  like_count INTEGER DEFAULT 0,
  retweet_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  quote_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  -- Tagging
  tweet_type TEXT DEFAULT 'other', -- 'product_launch', 'insight', 'social_proof', 'case_study', 'engagement', 'other'
  manually_tagged BOOLEAN DEFAULT false,
  topics TEXT[] DEFAULT '{}',
  -- Figma reference
  figma_file_id TEXT NULL,
  figma_file_name TEXT NULL,
  -- Metadata
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.twitter_tweets ENABLE ROW LEVEL SECURITY;

-- Allow all reads (internal tool, no user-level auth needed here)
CREATE POLICY "Allow full access to twitter_tweets"
  ON public.twitter_tweets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Table for storing AI-generated tweet drafts
CREATE TABLE public.tweet_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_text TEXT NOT NULL,
  context_tweet_ids TEXT[] DEFAULT '{}',
  figma_file_id TEXT NULL,
  figma_file_name TEXT NULL,
  prompt_used TEXT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'approved', 'posted', 'discarded'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tweet_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to tweet_drafts"
  ON public.tweet_drafts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated at trigger
CREATE TRIGGER update_twitter_tweets_updated_at
  BEFORE UPDATE ON public.twitter_tweets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tweet_drafts_updated_at
  BEFORE UPDATE ON public.tweet_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
