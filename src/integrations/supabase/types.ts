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
      ai_chat_messages: {
        Row: {
          created_at: string
          id: string
          message_id: string
          parts: Json
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          parts?: Json
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          parts?: Json
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credits: {
        Row: {
          free_used: number
          period: string
          purchased: number
          updated_at: string
          user_id: string
        }
        Insert: {
          free_used?: number
          period?: string
          purchased?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          free_used?: number
          period?: string
          purchased?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_eval_runs: {
        Row: {
          accuracy: number
          at: string
          correct: number
          details: Json | null
          id: number
          resolver_accuracy: number | null
          total: number
          user_id: string | null
        }
        Insert: {
          accuracy: number
          at?: string
          correct: number
          details?: Json | null
          id?: number
          resolver_accuracy?: number | null
          total: number
          user_id?: string | null
        }
        Update: {
          accuracy?: number
          at?: string
          correct?: number
          details?: Json | null
          id?: number
          resolver_accuracy?: number | null
          total?: number
          user_id?: string | null
        }
        Relationships: []
      }
      alert_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          match_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          match_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          match_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          factors: Json
          id: string
          match_id: string | null
          message: string
          score: number
          severity: string
          type: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          factors?: Json
          id?: string
          match_id?: string | null
          message: string
          score?: number
          severity?: string
          type: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          factors?: Json
          id?: string
          match_id?: string | null
          message?: string
          score?: number
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
      api_client_exclusions: {
        Row: {
          admin_id: string
          client_id: string
          created_at: string
        }
        Insert: {
          admin_id: string
          client_id: string
          created_at?: string
        }
        Update: {
          admin_id?: string
          client_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_client_exclusions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
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
          market_groups: string[]
          markup_pct: number
          name: string
          owner_id: string | null
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
          market_groups?: string[]
          markup_pct?: number
          name: string
          owner_id?: string | null
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
          market_groups?: string[]
          markup_pct?: number
          name?: string
          owner_id?: string | null
          rate_limit_per_min?: number
          sport_ids?: string[]
          tournament_ids?: string[]
        }
        Relationships: []
      }
      api_denials: {
        Row: {
          bucket_key: string
          client_id: string | null
          count: number
          endpoint: string
          id: number
          key_hint: string
          minute: string
          reason: string
        }
        Insert: {
          bucket_key: string
          client_id?: string | null
          count?: number
          endpoint: string
          id?: never
          key_hint?: string
          minute: string
          reason: string
        }
        Update: {
          bucket_key?: string
          client_id?: string | null
          count?: number
          endpoint?: string
          id?: never
          key_hint?: string
          minute?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_denials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          active: boolean
          allowed_ips: string[]
          client_id: string
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          kind: string
          label: string
          last_used_at: string | null
          prefix: string
          rotated_from: string | null
        }
        Insert: {
          active?: boolean
          allowed_ips?: string[]
          client_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          kind?: string
          label?: string
          last_used_at?: string | null
          prefix: string
          rotated_from?: string | null
        }
        Update: {
          active?: boolean
          allowed_ips?: string[]
          client_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          kind?: string
          label?: string
          last_used_at?: string | null
          prefix?: string
          rotated_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_rotated_from_fkey"
            columns: ["rotated_from"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          bytes: number
          cache_hits: number
          client_id: string
          count: number
          endpoint: string
          minute: string
        }
        Insert: {
          bytes?: number
          cache_hits?: number
          client_id: string
          count?: number
          endpoint: string
          minute: string
        }
        Update: {
          bytes?: number
          cache_hits?: number
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
          actor_role: string | null
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          hash: string | null
          id: string
          prev_hash: string | null
          seq: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          hash?: string | null
          id?: string
          prev_hash?: string | null
          seq?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          hash?: string | null
          id?: string
          prev_hash?: string | null
          seq?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      bookmaker_list_items: {
        Row: {
          bookmaker_id: string
          list_id: string
          weight: number
        }
        Insert: {
          bookmaker_id: string
          list_id: string
          weight?: number
        }
        Update: {
          bookmaker_id?: string
          list_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookmaker_list_items_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "bookmaker_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmaker_lists: {
        Row: {
          id: string
          level: string
          ref_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          level: string
          ref_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          level?: string
          ref_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookmaker_odds: {
        Row: {
          bookmaker_id: string
          id: string
          market: string
          match_id: string
          outcomes: Json
          specifier: string | null
          updated_at: string
        }
        Insert: {
          bookmaker_id: string
          id?: string
          market: string
          match_id: string
          outcomes?: Json
          specifier?: string | null
          updated_at?: string
        }
        Update: {
          bookmaker_id?: string
          id?: string
          market?: string
          match_id?: string
          outcomes?: Json
          specifier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmaker_odds_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmakers: {
        Row: {
          created_at: string
          id: string
          name: string
          suggested: boolean
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          suggested?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          suggested?: boolean
        }
        Relationships: []
      }
      cache_stats: {
        Row: {
          db_reads: number
          entries: number
          hits: number
          load_ms: number
          loads: number
          minute: string
          misses: number
          refreshed_at: string | null
          source: string
        }
        Insert: {
          db_reads?: number
          entries?: number
          hits?: number
          load_ms?: number
          loads?: number
          minute: string
          misses?: number
          refreshed_at?: string | null
          source: string
        }
        Update: {
          db_reads?: number
          entries?: number
          hits?: number
          load_ms?: number
          loads?: number
          minute?: string
          misses?: number
          refreshed_at?: string | null
          source?: string
        }
        Relationships: []
      }
      captcha_used: {
        Row: {
          expires_at: string
          id: string
        }
        Insert: {
          expires_at: string
          id: string
        }
        Update: {
          expires_at?: string
          id?: string
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
      cleanup_runs: {
        Row: {
          duration_ms: number
          error: string | null
          id: number
          ok: boolean
          result: Json | null
          started_at: string
        }
        Insert: {
          duration_ms: number
          error?: string | null
          id?: number
          ok: boolean
          result?: Json | null
          started_at: string
        }
        Update: {
          duration_ms?: number
          error?: string | null
          id?: number
          ok?: boolean
          result?: Json | null
          started_at?: string
        }
        Relationships: []
      }
      cost_settings: {
        Row: {
          currency: string
          fixed_monthly: number
          id: number
          included_egress_gb: number
          included_invocations: number
          price_per_gb_egress: number
          price_per_million_db_reads: number
          price_per_million_invocations: number
          updated_at: string
          updated_by: string | null
          upstream_monthly: number
        }
        Insert: {
          currency?: string
          fixed_monthly?: number
          id?: number
          included_egress_gb?: number
          included_invocations?: number
          price_per_gb_egress?: number
          price_per_million_db_reads?: number
          price_per_million_invocations?: number
          updated_at?: string
          updated_by?: string | null
          upstream_monthly?: number
        }
        Update: {
          currency?: string
          fixed_monthly?: number
          id?: number
          included_egress_gb?: number
          included_invocations?: number
          price_per_gb_egress?: number
          price_per_million_db_reads?: number
          price_per_million_invocations?: number
          updated_at?: string
          updated_by?: string | null
          upstream_monthly?: number
        }
        Relationships: []
      }
      feed_connection_secrets: {
        Row: {
          id: string
          mq_password: string | null
          updated_at: string
        }
        Insert: {
          id: string
          mq_password?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          mq_password?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_connection_secrets_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "feed_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_connections: {
        Row: {
          active: boolean
          id: string
          info: Json
          last_check: string | null
          status: string | null
          updated_at: string
          updated_by: string | null
          verified: boolean
        }
        Insert: {
          active?: boolean
          id: string
          info?: Json
          last_check?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          verified?: boolean
        }
        Update: {
          active?: boolean
          id?: string
          info?: Json
          last_check?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      feed_options: {
        Row: {
          options: Json
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          options?: Json
          scope: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          options?: Json
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      ladders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean
          kind: string
          name: string
          values: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          kind?: string
          name: string
          values?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          kind?: string
          name?: string
          values?: Json
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          count: number
          key: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          count?: number
          key: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          count?: number
          key?: string
          locked_until?: string | null
          updated_at?: string
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
          alerted: boolean
          control_mode: string
          id: string
          margin: number | null
          market: string
          market_group: string
          match_id: string
          outcomes: Json
          source: string
          specifier: string | null
          suspended: boolean
          updated_at: string
        }
        Insert: {
          alerted?: boolean
          control_mode?: string
          id?: string
          margin?: number | null
          market: string
          market_group?: string
          match_id: string
          outcomes?: Json
          source: string
          specifier?: string | null
          suspended?: boolean
          updated_at?: string
        }
        Update: {
          alerted?: boolean
          control_mode?: string
          id?: string
          margin?: number | null
          market?: string
          market_group?: string
          match_id?: string
          outcomes?: Json
          source?: string
          specifier?: string | null
          suspended?: boolean
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
          away_id: string | null
          away_team: string
          booked: boolean
          category_id: string
          comment_count: number
          control_mode: string
          early_odds: boolean
          home_id: string | null
          home_team: string
          hotlisted: boolean
          id: string
          liveodds: string
          margin_skewed: boolean
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
          away_id?: string | null
          away_team: string
          booked?: boolean
          category_id: string
          comment_count?: number
          control_mode?: string
          early_odds?: boolean
          home_id?: string | null
          home_team: string
          hotlisted?: boolean
          id: string
          liveodds?: string
          margin_skewed?: boolean
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
          away_id?: string | null
          away_team?: string
          booked?: boolean
          category_id?: string
          comment_count?: number
          control_mode?: string
          early_odds?: boolean
          home_id?: string | null
          home_team?: string
          hotlisted?: boolean
          id?: string
          liveodds?: string
          margin_skewed?: boolean
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
      odds_history: {
        Row: {
          changed_at: string
          id: number
          market: string
          match_id: string
          odds: number
          outcome: string
          prev_odds: number | null
          specifier: string | null
        }
        Insert: {
          changed_at?: string
          id?: never
          market: string
          match_id: string
          odds: number
          outcome: string
          prev_odds?: number | null
          specifier?: string | null
        }
        Update: {
          changed_at?: string
          id?: never
          market?: string
          match_id?: string
          odds?: number
          outcome?: string
          prev_odds?: number | null
          specifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odds_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_metrics: {
        Row: {
          at: string
          cache_hit_pct: number | null
          connections: number | null
          db_bytes: number
          dead_rows: number | null
          id: number
          kind: string
          server_mem_free: number | null
          server_mem_heap: number | null
          server_mem_rss: number | null
          server_mem_total: number | null
          tables: Json
          wal_bytes: number | null
        }
        Insert: {
          at?: string
          cache_hit_pct?: number | null
          connections?: number | null
          db_bytes: number
          dead_rows?: number | null
          id?: number
          kind?: string
          server_mem_free?: number | null
          server_mem_heap?: number | null
          server_mem_rss?: number | null
          server_mem_total?: number | null
          tables?: Json
          wal_bytes?: number | null
        }
        Update: {
          at?: string
          cache_hit_pct?: number | null
          connections?: number | null
          db_bytes?: number
          dead_rows?: number | null
          id?: number
          kind?: string
          server_mem_free?: number | null
          server_mem_heap?: number | null
          server_mem_rss?: number | null
          server_mem_total?: number | null
          tables?: Json
          wal_bytes?: number | null
        }
        Relationships: []
      }
      outrights: {
        Row: {
          competitors: Json
          created_by: string | null
          custom: boolean
          event_id: string | null
          id: string
          market_id: number | null
          market_name: string | null
          name: string
          odds_key: number
          scheduled: string | null
          status: string
          suspended: boolean
          tournament_id: string
          updated_at: string
        }
        Insert: {
          competitors?: Json
          created_by?: string | null
          custom?: boolean
          event_id?: string | null
          id: string
          market_id?: number | null
          market_name?: string | null
          name: string
          odds_key?: number
          scheduled?: string | null
          status?: string
          suspended?: boolean
          tournament_id: string
          updated_at?: string
        }
        Update: {
          competitors?: Json
          created_by?: string | null
          custom?: boolean
          event_id?: string | null
          id?: string
          market_id?: number | null
          market_name?: string | null
          name?: string
          odds_key?: number
          scheduled?: string | null
          status?: string
          suspended?: boolean
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
      payment_addresses: {
        Row: {
          active: boolean
          address: string
          network: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address: string
          network: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          network?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          address: string
          amount_exact: number
          checked_at: string | null
          confirmations: number | null
          created_at: string
          credits: number
          expires_at: string
          id: string
          network: string
          packs: number
          paid_at: string | null
          raw: Json | null
          reject_reason: string | null
          status: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          address: string
          amount_exact: number
          checked_at?: string | null
          confirmations?: number | null
          created_at?: string
          credits: number
          expires_at: string
          id?: string
          network: string
          packs: number
          paid_at?: string | null
          raw?: Json | null
          reject_reason?: string | null
          status?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          address?: string
          amount_exact?: number
          checked_at?: string | null
          confirmations?: number | null
          created_at?: string
          credits?: number
          expires_at?: string
          id?: string
          network?: string
          packs?: number
          paid_at?: string | null
          raw?: Json | null
          reject_reason?: string | null
          status?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          confirmations: Json
          free_monthly: number
          id: number
          order_ttl_min: number
          pack_price_usdt: number
          pack_size: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confirmations?: Json
          free_monthly?: number
          id?: number
          order_ttl_min?: number
          pack_price_usdt?: number
          pack_size?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confirmations?: Json
          free_monthly?: number
          id?: number
          order_ttl_min?: number
          pack_price_usdt?: number
          pack_size?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      rate_events: {
        Row: {
          at: string
          bucket: string
          id: number
          user_id: string
        }
        Insert: {
          at?: string
          bucket: string
          id?: never
          user_id: string
        }
        Update: {
          at?: string
          bucket?: string
          id?: never
          user_id?: string
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
      status_sync_runs: {
        Row: {
          at: string
          checked: number
          details: Json | null
          duration_ms: number
          errors: number
          forced: number
          id: number
          ok: boolean
          updated: number
        }
        Insert: {
          at?: string
          checked?: number
          details?: Json | null
          duration_ms?: number
          errors?: number
          forced?: number
          id?: number
          ok?: boolean
          updated?: number
        }
        Update: {
          at?: string
          checked?: number
          details?: Json | null
          duration_ms?: number
          errors?: number
          forced?: number
          id?: number
          ok?: boolean
          updated?: number
        }
        Relationships: []
      }
      template_assignments: {
        Row: {
          category_id: string | null
          id: string
          template_id: string
          tournament_id: string | null
        }
        Insert: {
          category_id?: string | null
          id?: string
          template_id: string
          tournament_id?: string | null
        }
        Update: {
          category_id?: string | null
          id?: string
          template_id?: string
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          ladder_id: string | null
          name: string
          sport_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          ladder_id?: string | null
          name: string
          sport_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          ladder_id?: string | null
          name?: string
          sport_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_ladder_id_fkey"
            columns: ["ladder_id"]
            isOneToOne: false
            referencedRelation: "ladders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_config: {
        Row: {
          activation: string
          alert_factor: number
          tournament_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activation?: string
          alert_factor?: number
          tournament_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activation?: string
          alert_factor?: number
          tournament_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_config_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
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
      uof_markets: {
        Row: {
          id: number
          market_group: string
          name: string
          name_de: string | null
          outcomes: Json
          outcomes_de: Json | null
          specifiers: string | null
          updated_at: string
          variant: string
        }
        Insert: {
          id: number
          market_group?: string
          name: string
          name_de?: string | null
          outcomes?: Json
          outcomes_de?: Json | null
          specifiers?: string | null
          updated_at?: string
          variant?: string
        }
        Update: {
          id?: number
          market_group?: string
          name?: string
          name_de?: string | null
          outcomes?: Json
          outcomes_de?: Json | null
          specifiers?: string | null
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      uof_messages_log: {
        Row: {
          created_at: string
          error: string
          event_id: string | null
          id: number
          kind: string
        }
        Insert: {
          created_at?: string
          error: string
          event_id?: string | null
          id?: never
          kind: string
        }
        Update: {
          created_at?: string
          error?: string
          event_id?: string | null
          id?: never
          kind?: string
        }
        Relationships: []
      }
      uof_producers: {
        Row: {
          down: boolean
          id: number
          last_alive_at: string | null
          last_message_at: string | null
          last_recovery_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          down?: boolean
          id: number
          last_alive_at?: string | null
          last_message_at?: string | null
          last_recovery_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          down?: boolean
          id?: number
          last_alive_at?: string | null
          last_message_at?: string | null
          last_recovery_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      uof_sync_runs: {
        Row: {
          created_at: string
          details: Json | null
          id: number
          kind: string
          ok: boolean
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: never
          kind: string
          ok: boolean
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: never
          kind?: string
          ok?: boolean
        }
        Relationships: []
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
      ai_admin_adjust: {
        Args: { _actor: string; _delta: number; _reason: string; _user: string }
        Returns: number
      }
      ai_consume: { Args: { _user: string }; Returns: Json }
      ai_credit_order: {
        Args: { _order: string; _raw: Json; _tx: string }
        Returns: boolean
      }
      ai_refund: { Args: { _user: string }; Returns: undefined }
      api_track: {
        Args: { _client: string; _endpoint: string; _limit: number }
        Returns: number
      }
      api_track_denial: {
        Args: {
          _client: string
          _endpoint: string
          _key_hint: string
          _reason: string
        }
        Returns: undefined
      }
      api_track_meta: {
        Args: {
          _bytes: number
          _cache_hit: boolean
          _client: string
          _endpoint: string
        }
        Returns: undefined
      }
      audit_hash: {
        Args: {
          _action: string
          _at: string
          _details: Json
          _entity: string
          _entity_id: string
          _prev: string
          _seq: number
          _user: string
        }
        Returns: string
      }
      audit_verify: {
        Args: never
        Returns: {
          broken_seq: number
          checked: number
          ok: boolean
        }[]
      }
      cache_track: {
        Args: {
          _db_reads: number
          _entries: number
          _hits: number
          _load_ms: number
          _loads: number
          _misses: number
          _refreshed_at: string
          _source: string
        }
        Returns: undefined
      }
      can_see_api_client: {
        Args: { _client: string; _user: string }
        Returns: boolean
      }
      can_see_audit: {
        Args: {
          _actor: string
          _entity: string
          _entity_id: string
          _user: string
        }
        Returns: boolean
      }
      db_cleanup: { Args: never; Returns: Json }
      db_cleanup_core: { Args: never; Returns: Json }
      feed_connection_activate: { Args: { _id: string }; Returns: Json }
      feed_health: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_batch: {
        Args: { _matches: Json; _producers: Json }
        Returns: number
      }
      ingest_settlements: { Args: { _rows: Json }; Returns: number }
      market_group_of: { Args: { _name: string }; Returns: string }
      ops_snapshot: { Args: never; Returns: undefined }
      ops_snapshot_ext: {
        Args: {
          _free: number
          _heap: number
          _kind: string
          _rss: number
          _total: number
        }
        Returns: undefined
      }
      owns_api_client: {
        Args: { _client: string; _user: string }
        Returns: boolean
      }
      set_odds_suspended: {
        Args: { _groups: Json; _stops: string[] }
        Returns: number
      }
      top_role: { Args: { _user: string }; Returns: string }
      upsert_match_odds: { Args: { _rows: Json }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "trader" | "viewer" | "super_admin"
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
      app_role: ["admin", "trader", "viewer", "super_admin"],
    },
  },
} as const
