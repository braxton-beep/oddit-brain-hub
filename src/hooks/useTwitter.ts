import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Tweet {
  id: string;
  tweet_id: string;
  text: string;
  created_at_twitter: string | null;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  impression_count: number;
  tweet_type: string;
  manually_tagged: boolean;
  topics: string[];
  figma_file_id: string | null;
  figma_file_name: string | null;
  synced_at: string;
  created_at: string;
}

export interface TweetDraft {
  id: string;
  draft_text: string;
  context_tweet_ids: string[];
  figma_file_id: string | null;
  figma_file_name: string | null;
  prompt_used: string | null;
  status: string;
  created_at: string;
}

export const TWEET_TYPES = [
  { id: "all", label: "All", emoji: "📋" },
  { id: "insight", label: "Insight", emoji: "💡" },
  { id: "case_study", label: "Case Study", emoji: "📊" },
  { id: "product_launch", label: "Product/Audit", emoji: "🚀" },
  { id: "social_proof", label: "Social Proof", emoji: "⭐" },
  { id: "engagement", label: "Engagement", emoji: "💬" },
  { id: "other", label: "Other", emoji: "📝" },
];

export function useTweets(tweetType?: string, figmaFileId?: string) {
  return useQuery({
    queryKey: ["tweets", tweetType, figmaFileId],
    queryFn: async () => {
      let q = supabase
        .from("twitter_tweets")
        .select("*")
        .order("like_count", { ascending: false })
        .limit(200);
      if (tweetType && tweetType !== "all") {
        q = q.eq("tweet_type", tweetType);
      }
      if (figmaFileId) {
        q = q.eq("figma_file_id", figmaFileId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Tweet[];
    },
  });
}

export function useTweetStats() {
  return useQuery({
    queryKey: ["tweet-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("twitter_tweets")
        .select("tweet_type, like_count, retweet_count");
      if (error) throw error;
      const total = data?.length ?? 0;
      const byType: Record<string, number> = {};
      let totalLikes = 0;
      for (const t of data ?? []) {
        byType[t.tweet_type] = (byType[t.tweet_type] ?? 0) + 1;
        totalLikes += t.like_count ?? 0;
      }
      return { total, byType, totalLikes };
    },
  });
}

export function useTweetDrafts() {
  return useQuery({
    queryKey: ["tweet-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tweet_drafts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as TweetDraft[];
    },
  });
}

export function useSyncTweets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-tweets");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweets"] });
      qc.invalidateQueries({ queryKey: ["tweet-stats"] });
    },
  });
}

export function useCraftTweet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      topic?: string;
      tweet_type?: string;
      figma_file_id?: string;
      custom_prompt?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("craft-tweet", {
        body: params,
      });
      if (error) throw error;
      return data as { content: string; draft_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweet-drafts"] });
    },
  });
}

export function useUpdateTweetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tweet_type }: { id: string; tweet_type: string }) => {
      const { error } = await supabase
        .from("twitter_tweets")
        .update({ tweet_type, manually_tagged: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tweets"] }),
  });
}

export function useUpdateDraftStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("tweet_drafts")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tweet-drafts"] }),
  });
}
