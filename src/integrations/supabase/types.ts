export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string
          id: string
          status: string
          workflow_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          workflow_name: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          workflow_name?: string
        }
        Relationships: []
      }
      brain_prompts: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          prompt: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          prompt: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          prompt?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_implementations: {
        Row: {
          audit_id: string
          id: string
          notes: string | null
          recommendation_id: number
          status: string
          updated_at: string
        }
        Insert: {
          audit_id: string
          id?: string
          notes?: string | null
          recommendation_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          audit_id?: string
          id?: string
          notes?: string | null
          recommendation_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_implementations_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "cro_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string
          contact_name: string
          created_at: string
          id: string
          industry: string
          name: string
          notes: string
          project_status: string
          revenue_tier: string
          shopify_url: string
          tags: string[]
          updated_at: string
          vertical: string
        }
        Insert: {
          contact_email?: string
          contact_name?: string
          created_at?: string
          id?: string
          industry?: string
          name: string
          notes?: string
          project_status?: string
          revenue_tier?: string
          shopify_url?: string
          tags?: string[]
          updated_at?: string
          vertical?: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          created_at?: string
          id?: string
          industry?: string
          name?: string
          notes?: string
          project_status?: string
          revenue_tier?: string
          shopify_url?: string
          tags?: string[]
          updated_at?: string
          vertical?: string
        }
        Relationships: []
      }
      competitive_intel: {
        Row: {
          client_name: string
          competitor_url: string
          created_at: string
          findings: Json | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_name?: string
          competitor_url?: string
          created_at?: string
          findings?: Json | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          competitor_url?: string
          created_at?: string
          findings?: Json | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cro_audits: {
        Row: {
          client_name: string
          created_at: string
          created_by: string | null
          id: string
          portal_enabled: boolean
          portal_token: string | null
          recommendations: Json | null
          screenshot_url: string | null
          shop_url: string
          status: string
          updated_at: string
        }
        Insert: {
          client_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          portal_enabled?: boolean
          portal_token?: string | null
          recommendations?: Json | null
          screenshot_url?: string | null
          shop_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          portal_enabled?: boolean
          portal_token?: string | null
          recommendations?: Json | null
          screenshot_url?: string | null
          shop_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          call_date: string | null
          client_name: string
          created_at: string
          draft_body: string
          id: string
          status: string
          subject_line: string
          transcript_id: string | null
          updated_at: string
        }
        Insert: {
          call_date?: string | null
          client_name?: string
          created_at?: string
          draft_body?: string
          id?: string
          status?: string
          subject_line?: string
          transcript_id?: string | null
          updated_at?: string
        }
        Update: {
          call_date?: string | null
          client_name?: string
          created_at?: string
          draft_body?: string
          id?: string
          status?: string
          subject_line?: string
          transcript_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "fireflies_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      figma_files: {
        Row: {
          client_name: string | null
          created_at: string
          design_type: string
          figma_file_key: string
          figma_url: string | null
          id: string
          last_modified: string | null
          name: string
          project_id: string | null
          project_name: string | null
          raw_metadata: Json | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          design_type?: string
          figma_file_key: string
          figma_url?: string | null
          id?: string
          last_modified?: string | null
          name?: string
          project_id?: string | null
          project_name?: string | null
          raw_metadata?: Json | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          design_type?: string
          figma_file_key?: string
          figma_url?: string | null
          id?: string
          last_modified?: string | null
          name?: string
          project_id?: string | null
          project_name?: string | null
          raw_metadata?: Json | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      figma_projects: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          project_id: string
          project_name: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          project_id: string
          project_name?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          project_id?: string
          project_name?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fireflies_transcripts: {
        Row: {
          action_items: string | null
          created_at: string
          date: string | null
          duration: number | null
          fireflies_id: string
          id: string
          organizer_email: string | null
          participants: string[] | null
          source_api_key_id: string | null
          speaker_stats: Json | null
          summary: string | null
          title: string
          transcript_text: string | null
          updated_at: string
        }
        Insert: {
          action_items?: string | null
          created_at?: string
          date?: string | null
          duration?: number | null
          fireflies_id: string
          id?: string
          organizer_email?: string | null
          participants?: string[] | null
          source_api_key_id?: string | null
          speaker_stats?: Json | null
          summary?: string | null
          title?: string
          transcript_text?: string | null
          updated_at?: string
        }
        Update: {
          action_items?: string | null
          created_at?: string
          date?: string | null
          duration?: number | null
          fireflies_id?: string
          id?: string
          organizer_email?: string | null
          participants?: string[] | null
          source_api_key_id?: string | null
          speaker_stats?: Json | null
          summary?: string | null
          title?: string
          transcript_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fireflies_transcripts_source_api_key_id_fkey"
            columns: ["source_api_key_id"]
            isOneToOne: false
            referencedRelation: "integration_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      google_drive_files: {
        Row: {
          client_name: string | null
          created_at: string
          doc_type: string
          drive_file_id: string
          drive_url: string | null
          folder_id: string | null
          folder_name: string | null
          id: string
          last_modified: string | null
          mime_type: string
          name: string
          raw_metadata: Json | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          doc_type?: string
          drive_file_id: string
          drive_url?: string | null
          folder_id?: string | null
          folder_name?: string | null
          id?: string
          last_modified?: string | null
          mime_type?: string
          name?: string
          raw_metadata?: Json | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          doc_type?: string
          drive_file_id?: string
          drive_url?: string | null
          folder_id?: string | null
          folder_name?: string | null
          id?: string
          last_modified?: string | null
          mime_type?: string
          name?: string
          raw_metadata?: Json | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      google_drive_folders: {
        Row: {
          created_at: string
          enabled: boolean
          folder_id: string
          folder_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          folder_id: string
          folder_name?: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          folder_id?: string
          folder_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          id: string
          integration_id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          integration_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          integration_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_sources: {
        Row: {
          created_at: string
          icon: string
          id: string
          integration_id: string | null
          item_count: number
          name: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          integration_id?: string | null
          item_count?: number
          name: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          integration_id?: string | null
          item_count?: number
          name?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpi_benchmarks: {
        Row: {
          created_at: string
          id: string
          industry: string
          metric_name: string
          p25: number | null
          p50: number | null
          p75: number | null
          revenue_tier: string
          source_count: number
          source_transcript_ids: Json | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry?: string
          metric_name?: string
          p25?: number | null
          p50?: number | null
          p75?: number | null
          revenue_tier?: string
          source_count?: number
          source_transcript_ids?: Json | null
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string
          metric_name?: string
          p25?: number | null
          p50?: number | null
          p75?: number | null
          revenue_tier?: string
          source_count?: number
          source_transcript_ids?: Json | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      oddit_scores: {
        Row: {
          clarity_value_prop: number
          client_name: string
          copy_strength: number
          created_at: string
          cro_audit_id: string | null
          dimension_notes: Json | null
          funnel_logic: number
          id: string
          mobile_ux: number
          shop_url: string
          social_proof: number
          speed_perception: number
          total_score: number
          trust_signals: number
          updated_at: string
          visual_hierarchy: number
        }
        Insert: {
          clarity_value_prop?: number
          client_name?: string
          copy_strength?: number
          created_at?: string
          cro_audit_id?: string | null
          dimension_notes?: Json | null
          funnel_logic?: number
          id?: string
          mobile_ux?: number
          shop_url?: string
          social_proof?: number
          speed_perception?: number
          total_score?: number
          trust_signals?: number
          updated_at?: string
          visual_hierarchy?: number
        }
        Update: {
          clarity_value_prop?: number
          client_name?: string
          copy_strength?: number
          created_at?: string
          cro_audit_id?: string | null
          dimension_notes?: Json | null
          funnel_logic?: number
          id?: string
          mobile_ux?: number
          shop_url?: string
          social_proof?: number
          speed_perception?: number
          total_score?: number
          trust_signals?: number
          updated_at?: string
          visual_hierarchy?: number
        }
        Relationships: [
          {
            foreignKeyName: "oddit_scores_cro_audit_id_fkey"
            columns: ["cro_audit_id"]
            isOneToOne: false
            referencedRelation: "cro_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner: string
          priority: string
          progress: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          owner?: string
          priority?: string
          progress?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner?: string
          priority?: string
          progress?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      recommendation_insights: {
        Row: {
          category: string
          client_examples: Json | null
          created_at: string
          frequency_count: number
          id: string
          recommendation_text: string
          template_content: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          client_examples?: Json | null
          created_at?: string
          frequency_count?: number
          id?: string
          recommendation_text: string
          template_content?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          client_examples?: Json | null
          created_at?: string
          frequency_count?: number
          id?: string
          recommendation_text?: string
          template_content?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      report_drafts: {
        Row: {
          client_name: string
          created_at: string
          fireflies_id: string | null
          id: string
          progress: number
          sections: Json | null
          status: string
          transcript_id: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string
          created_at?: string
          fireflies_id?: string | null
          id?: string
          progress?: number
          sections?: Json | null
          status?: string
          transcript_id?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          fireflies_id?: string | null
          id?: string
          progress?: number
          sections?: Json | null
          status?: string
          transcript_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          status: string
          steps: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          status?: string
          steps?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          status?: string
          steps?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
