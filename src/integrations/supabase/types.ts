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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          match_id: string | null
          message: string
          severity: string
          type: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          message: string
          severity?: string
          type: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          message?: string
          severity?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      api_clients: {
        Row: {
          active: boolean
          allowed_domains: string[]
          created_at: string
          formats: string[]
          id: string
          markup_pct: number
          name: string
          rate_limit_per_min: number
          sport_ids: string[]
          tournament_ids: string[]
        }
        Insert: {
          active?: boolean
          allowed_domains?: string[]
          created_at?: string
          formats?: string[]
          id?: string
          markup_pct?: number
          name: string
          rate_limit_per_min?: number
          sport_ids?: string[]
          tournament_ids?: string[]
        }
        Update: {
          active?: boolean
          allowed_domains?: string[]
          created_at?: string
          formats?: string[]
          id?: string
          markup_pct?: number
          name?: string
          rate_limit_per_min?: number
          sport_ids?: string[]
          tournament_ids?: string[]
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          id: string
          key_hash: string
          kind: string
          last_used_at: string | null
          prefix: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          id?: string
          key_hash: string
          kind?: string
          last_used_at?: string | null
          prefix: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          id?: string
          key_hash?: string
          kind?: string
          last_used_at?: string | null
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          client_id: string
          count: number
          endpoint: string
          minute: string
        }
        Insert: {
          client_id: string
          count?: number
          endpoint: string
          minute: string
        }
        Update: {
          client_id?: string
          count?: number
          endpoint?: string
          minute?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          country_code: string | null
          id: string
          name: string
          sport_id: string
        }
        Insert: {
          country_code?: string | null
          id: string
          name: string
          sport_id: string
        }
        Update: {
          country_code?: string | null
          id?: string
          name?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      margin_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          margin: number
          market: string
          max_stake: number | null
          name: string
          sport_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          margin?: number
          market: string
          max_stake?: number | null
          name: string
          sport_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          margin?: number
          market?: string
          max_stake?: number | null
          name?: string
          sport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "margin_templates_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      match_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          match_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          match_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_comments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_odds: {
        Row: {
          id: string
          margin: number | null
          market: string
          match_id: string
          outcomes: Json
          source: string
          specifier: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          margin?: number | null
          market: string
          match_id: string
          outcomes?: Json
          source: string
          specifier?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          margin?: number | null
          market?: string
          match_id?: string
          outcomes?: Json
          source?: string
          specifier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          alerted: boolean
          away_team: string
          booked: boolean
          category_id: string
          comment_count: number
          control_mode: string
          early_odds: boolean
          home_team: string
          hotlisted: boolean
          id: string
          liveodds: string
          match_minute: number | null
          provider_only: boolean
          scheduled: string
          sport_id: string
          status: string
          suspended: boolean
          tournament_id: string
          updated_at: string
        }
        Insert: {
          alerted?: boolean
          away_team: string
          booked?: boolean
          category_id: string
          comment_count?: number
          control_mode?: string
          early_odds?: boolean
          home_team: string
          hotlisted?: boolean
          id: string
          liveodds?: string
          match_minute?: number | null
          provider_only?: boolean
          scheduled: string
          sport_id: string
          status?: string
          suspended?: boolean
          tournament_id: string
          updated_at?: string
        }
        Update: {
          alerted?: boolean
          away_team?: string
          booked?: boolean
          category_id?: string
          comment_count?: number
          control_mode?: string
          early_odds?: boolean
          home_team?: string
          hotlisted?: boolean
          id?: string
          liveodds?: string
          match_minute?: number | null
          provider_only?: boolean
          scheduled?: string
          sport_id?: string
          status?: string
          suspended?: boolean
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      outrights: {
        Row: {
          competitors: Json
          id: string
          name: string
          scheduled: string | null
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          competitors?: Json
          id: string
          name: string
          scheduled?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          competitors?: Json
          id?: string
          name?: string
          scheduled?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outrights_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      settlements: {
        Row: {
          created_at: string
          id: string
          market: string
          match_id: string | null
          outcome: string | null
          settled_at: string | null
          settled_by: string | null
          specifier: string | null
          state: string
        }
        Insert: {
          created_at?: string
          id?: string
          market: string
          match_id?: string | null
          outcome?: string | null
          settled_at?: string | null
          settled_by?: string | null
          specifier?: string | null
          state?: string
        }
        Update: {
          created_at?: string
          id?: string
          market?: string
          match_id?: string | null
          outcome?: string | null
          settled_at?: string | null
          settled_by?: string | null
          specifier?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          category_id: string
          id: string
          name: string
          sport_id: string
        }
        Insert: {
          category_id: string
          id: string
          name: string
          sport_id: string
        }
        Update: {
          category_id?: string
          id?: string
          name?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          default_sports: string[]
          language: string
          notifications: Json
          odds_format: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          default_sports?: string[]
          language?: string
          notifications?: Json
          odds_format?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          default_sports?: string[]
          language?: string
          notifications?: Json
          odds_format?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      api_track: {
        Args: { _client: string; _endpoint: string; _limit: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "trader" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "trader", "viewer"],
    },
  },
} as const
