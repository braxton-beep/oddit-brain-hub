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
      cro_audits: {
        Row: {
          client_name: string
          created_at: string
          created_by: string | null
          id: string
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
