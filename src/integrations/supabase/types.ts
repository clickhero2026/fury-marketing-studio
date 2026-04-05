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
      ad_sets: {
        Row: {
          bid_strategy: string | null
          billing_event: string | null
          campaign_id: string
          clicks: number | null
          company_id: string | null
          created_at: string | null
          daily_budget: number | null
          destination_type: string | null
          effective_status: string | null
          end_time: string | null
          external_id: string
          id: string
          impressions: number | null
          learning_stage: string | null
          lifetime_budget: number | null
          name: string
          optimization_goal: string | null
          platform: string
          spend: number | null
          start_time: string | null
          status: string
          targeting: Json | null
          updated_at: string | null
        }
        Insert: {
          bid_strategy?: string | null
          billing_event?: string | null
          campaign_id: string
          clicks?: number | null
          company_id?: string | null
          created_at?: string | null
          daily_budget?: number | null
          destination_type?: string | null
          effective_status?: string | null
          end_time?: string | null
          external_id: string
          id?: string
          impressions?: number | null
          learning_stage?: string | null
          lifetime_budget?: number | null
          name: string
          optimization_goal?: string | null
          platform: string
          spend?: number | null
          start_time?: string | null
          status: string
          targeting?: Json | null
          updated_at?: string | null
        }
        Update: {
          bid_strategy?: string | null
          billing_event?: string | null
          campaign_id?: string
          clicks?: number | null
          company_id?: string | null
          created_at?: string | null
          daily_budget?: number | null
          destination_type?: string | null
          effective_status?: string | null
          end_time?: string | null
          external_id?: string
          id?: string
          impressions?: number | null
          learning_stage?: string | null
          lifetime_budget?: number | null
          name?: string
          optimization_goal?: string | null
          platform?: string
          spend?: number | null
          start_time?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_campaign_id_campaigns_id_fk"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          api_key: string | null
          compliance_system_prompt: string | null
          compliance_user_prompt_template: string | null
          created_at: string | null
          id: string
          max_tokens: number
          model: string
          performance_system_prompt: string | null
          performance_user_prompt_template: string | null
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          compliance_system_prompt?: string | null
          compliance_user_prompt_template?: string | null
          created_at?: string | null
          id?: string
          max_tokens?: number
          model?: string
          performance_system_prompt?: string | null
          performance_user_prompt_template?: string | null
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          compliance_system_prompt?: string | null
          compliance_user_prompt_template?: string | null
          created_at?: string | null
          id?: string
          max_tokens?: number
          model?: string
          performance_system_prompt?: string | null
          performance_user_prompt_template?: string | null
          temperature?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      auction_insights: {
        Row: {
          abs_top_of_page_rate: number | null
          campaign_name: string | null
          company_id: string
          created_at: string | null
          date: string | null
          device: string | null
          display_domain: string
          id: string
          impression_share: number | null
          outranking_share: number | null
          overlap_rate: number | null
          position_above_rate: number | null
          top_of_page_rate: number | null
        }
        Insert: {
          abs_top_of_page_rate?: number | null
          campaign_name?: string | null
          company_id: string
          created_at?: string | null
          date?: string | null
          device?: string | null
          display_domain: string
          id?: string
          impression_share?: number | null
          outranking_share?: number | null
          overlap_rate?: number | null
          position_above_rate?: number | null
          top_of_page_rate?: number | null
        }
        Update: {
          abs_top_of_page_rate?: number | null
          campaign_name?: string | null
          company_id?: string
          created_at?: string | null
          date?: string | null
          device?: string | null
          display_domain?: string
          id?: string
          impression_share?: number | null
          outranking_share?: number | null
          overlap_rate?: number | null
          position_above_rate?: number | null
          top_of_page_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_insights_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_actions: {
        Row: {
          action: string
          audit_id: string
          company_id: string | null
          created_at: string | null
          executed_at: string | null
          id: string
          status: string | null
        }
        Insert: {
          action: string
          audit_id: string
          company_id?: string | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          action?: string
          audit_id?: string
          company_id?: string | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_actions_audit_id_audits_id_fk"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_actions_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          ai_analysis: Json | null
          company_id: string | null
          compliance_score: number
          created_at: string | null
          creative_id: string
          id: string
          issues: Json | null
          performance_score: number
          policy_id: string | null
          recommendations: Json | null
          status: string
        }
        Insert: {
          ai_analysis?: Json | null
          company_id?: string | null
          compliance_score: number
          created_at?: string | null
          creative_id: string
          id?: string
          issues?: Json | null
          performance_score: number
          policy_id?: string | null
          recommendations?: Json | null
          status: string
        }
        Update: {
          ai_analysis?: Json | null
          company_id?: string | null
          compliance_score?: number
          created_at?: string | null
          creative_id?: string
          id?: string
          issues?: Json | null
          performance_score?: number
          policy_id?: string | null
          recommendations?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_creative_id_creatives_id_fk"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_policy_id_policies_id_fk"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_configurations: {
        Row: {
          accent_color: string | null
          brand_guidelines: string | null
          brand_name: string
          company_id: string | null
          created_at: string | null
          font_family: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          brand_guidelines?: string | null
          brand_name: string
          company_id?: string | null
          created_at?: string | null
          font_family?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          brand_guidelines?: string | null
          brand_name?: string
          company_id?: string | null
          created_at?: string | null
          font_family?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_configurations_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          ad_url: string | null
          anuncios: string
          campanha: string
          cidade: string | null
          cliques: number | null
          company_id: string | null
          conversas_iniciadas: number | null
          conversion_rate_ranking: string | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          custo_conversa: number | null
          data: string
          engagement_rate_ranking: string | null
          frequency: number | null
          grupo_anuncios: string
          id: string
          impressoes: number | null
          investimento: number | null
          nome_conta: string
          quality_ranking: string | null
          reach: number | null
          regiao: string | null
          source: string | null
          status: string | null
          sync_batch: string | null
          unique_clicks: number | null
          unique_ctr: number | null
          updated_at: string | null
          video_p100: number | null
          video_p25: number | null
          video_p50: number | null
          video_p75: number | null
          website_purchase_roas: number | null
        }
        Insert: {
          ad_url?: string | null
          anuncios: string
          campanha: string
          cidade?: string | null
          cliques?: number | null
          company_id?: string | null
          conversas_iniciadas?: number | null
          conversion_rate_ranking?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          custo_conversa?: number | null
          data: string
          engagement_rate_ranking?: string | null
          frequency?: number | null
          grupo_anuncios: string
          id?: string
          impressoes?: number | null
          investimento?: number | null
          nome_conta: string
          quality_ranking?: string | null
          reach?: number | null
          regiao?: string | null
          source?: string | null
          status?: string | null
          sync_batch?: string | null
          unique_clicks?: number | null
          unique_ctr?: number | null
          updated_at?: string | null
          video_p100?: number | null
          video_p25?: number | null
          video_p50?: number | null
          video_p75?: number | null
          website_purchase_roas?: number | null
        }
        Update: {
          ad_url?: string | null
          anuncios?: string
          campanha?: string
          cidade?: string | null
          cliques?: number | null
          company_id?: string | null
          conversas_iniciadas?: number | null
          conversion_rate_ranking?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          custo_conversa?: number | null
          data?: string
          engagement_rate_ranking?: string | null
          frequency?: number | null
          grupo_anuncios?: string
          id?: string
          impressoes?: number | null
          investimento?: number | null
          nome_conta?: string
          quality_ranking?: string | null
          reach?: number | null
          regiao?: string | null
          source?: string | null
          status?: string | null
          sync_batch?: string | null
          unique_clicks?: number | null
          unique_ctr?: number | null
          updated_at?: string | null
          video_p100?: number | null
          video_p25?: number | null
          video_p50?: number | null
          video_p75?: number | null
          website_purchase_roas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_tags: {
        Row: {
          campaign_id: string
          created_at: string | null
          tag_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          tag_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_tags_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          account: string | null
          advantage_state: string | null
          api_created_at: string | null
          budget: number | null
          budget_remaining: number | null
          buying_type: string | null
          company_id: string | null
          created_at: string | null
          created_time: string | null
          effective_status: string | null
          external_id: string
          id: string
          integration_id: string
          name: string
          objective: string | null
          platform: string
          spend: string | null
          spend_cap: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          account?: string | null
          advantage_state?: string | null
          api_created_at?: string | null
          budget?: number | null
          budget_remaining?: number | null
          buying_type?: string | null
          company_id?: string | null
          created_at?: string | null
          created_time?: string | null
          effective_status?: string | null
          external_id: string
          id?: string
          integration_id: string
          name: string
          objective?: string | null
          platform: string
          spend?: string | null
          spend_cap?: number | null
          status: string
          updated_at?: string | null
        }
        Update: {
          account?: string | null
          advantage_state?: string | null
          api_created_at?: string | null
          budget?: number | null
          budget_remaining?: number | null
          buying_type?: string | null
          company_id?: string | null
          created_at?: string | null
          created_time?: string | null
          effective_status?: string | null
          external_id?: string
          id?: string
          integration_id?: string
          name?: string
          objective?: string | null
          platform?: string
          spend?: string | null
          spend_cap?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_integration_id_integrations_id_fk"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          audits_this_month: number | null
          billing_email: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          current_campaigns: number | null
          current_users: number | null
          id: string
          logo_url: string | null
          max_audits_per_month: number | null
          max_campaigns: number | null
          max_users: number | null
          metadata: Json | null
          name: string
          organization_id: string | null
          primary_color: string | null
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["company_status"] | null
          subscription_end_date: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_start_date: string | null
          subscription_status: string | null
          tax_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          audits_this_month?: number | null
          billing_email?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          current_campaigns?: number | null
          current_users?: number | null
          id?: string
          logo_url?: string | null
          max_audits_per_month?: number | null
          max_campaigns?: number | null
          max_users?: number | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["company_status"] | null
          subscription_end_date?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          audits_this_month?: number | null
          billing_email?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          current_campaigns?: number | null
          current_users?: number | null
          id?: string
          logo_url?: string | null
          max_audits_per_month?: number | null
          max_campaigns?: number | null
          max_users?: number | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["company_status"] | null
          subscription_end_date?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_criteria: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_text_length: number | null
          min_text_length: number | null
          name: string
          prohibited_keywords: Json | null
          prohibited_phrases: Json | null
          required_keywords: Json | null
          required_phrases: Json | null
          requires_brand_colors: boolean | null
          requires_logo: boolean | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_text_length?: number | null
          min_text_length?: number | null
          name: string
          prohibited_keywords?: Json | null
          prohibited_phrases?: Json | null
          required_keywords?: Json | null
          required_phrases?: Json | null
          requires_brand_colors?: boolean | null
          requires_logo?: boolean | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_text_length?: number | null
          min_text_length?: number | null
          name?: string
          prohibited_keywords?: Json | null
          prohibited_phrases?: Json | null
          required_keywords?: Json | null
          required_phrases?: Json | null
          requires_brand_colors?: boolean | null
          requires_logo?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_criteria_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_patterns: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          patterns: Json
          period_end: string
          period_start: string
          recommendations: Json
          top_performers: Json | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          patterns: Json
          period_end: string
          period_start: string
          recommendations: Json
          top_performers?: Json | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          patterns?: Json
          period_end?: string
          period_start?: string
          recommendations?: Json
          top_performers?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_patterns_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_tags: {
        Row: {
          created_at: string | null
          creative_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          creative_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          creative_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_tags_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          ad_set_id: string | null
          brand_analysis: Json | null
          call_to_action: string | null
          campaign_id: string
          carousel_images: Json | null
          clicks: number | null
          color_analysis: Json | null
          company_id: string | null
          composition_analysis: Json | null
          conversions: number | null
          cpc: number | null
          created_at: string | null
          creative_format: string | null
          ctr: number | null
          description: string | null
          detected_media_type: string | null
          emotional_tone: string | null
          external_id: string
          headline: string | null
          id: string
          image_url: string | null
          impressions: number | null
          name: string
          performance_score: number | null
          platform: string | null
          status: string
          text: string | null
          text_analysis: Json | null
          type: string
          updated_at: string | null
          video_url: string | null
          visual_elements: Json | null
        }
        Insert: {
          ad_set_id?: string | null
          brand_analysis?: Json | null
          call_to_action?: string | null
          campaign_id: string
          carousel_images?: Json | null
          clicks?: number | null
          color_analysis?: Json | null
          company_id?: string | null
          composition_analysis?: Json | null
          conversions?: number | null
          cpc?: number | null
          created_at?: string | null
          creative_format?: string | null
          ctr?: number | null
          description?: string | null
          detected_media_type?: string | null
          emotional_tone?: string | null
          external_id: string
          headline?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          name: string
          performance_score?: number | null
          platform?: string | null
          status: string
          text?: string | null
          text_analysis?: Json | null
          type: string
          updated_at?: string | null
          video_url?: string | null
          visual_elements?: Json | null
        }
        Update: {
          ad_set_id?: string | null
          brand_analysis?: Json | null
          call_to_action?: string | null
          campaign_id?: string
          carousel_images?: Json | null
          clicks?: number | null
          color_analysis?: Json | null
          company_id?: string | null
          composition_analysis?: Json | null
          conversions?: number | null
          cpc?: number | null
          created_at?: string | null
          creative_format?: string | null
          ctr?: number | null
          description?: string | null
          detected_media_type?: string | null
          emotional_tone?: string | null
          external_id?: string
          headline?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          name?: string
          performance_score?: number | null
          platform?: string | null
          status?: string
          text?: string | null
          text_analysis?: Json | null
          type?: string
          updated_at?: string | null
          video_url?: string | null
          visual_elements?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "creatives_ad_set_id_ad_sets_id_fk"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_campaign_id_campaigns_id_fk"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_sheets_config: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          last_sync: string | null
          name: string
          sheet_id: string
          status: string | null
          tab_gid: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_sync?: string | null
          name: string
          sheet_id: string
          status?: string | null
          tab_gid?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_sync?: string | null
          name?: string
          sheet_id?: string
          status?: string | null
          tab_gid?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_sheets_config_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_infractions: {
        Row: {
          company_id: string
          details: Json | null
          detected_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          resolved_at: string | null
          rule_id: string | null
          status: string | null
        }
        Insert: {
          company_id: string
          details?: Json | null
          detected_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          resolved_at?: string | null
          rule_id?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string
          details?: Json | null
          detected_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          resolved_at?: string | null
          rule_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_infractions_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_infractions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_infractions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "governance_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_infractions_rule_id_governance_rules_id_fk"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "governance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_rules: {
        Row: {
          active: boolean | null
          company_id: string
          created_at: string | null
          id: string
          name: string
          params: Json
          severity: string | null
          type: string
        }
        Insert: {
          active?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          params?: Json
          severity?: string | null
          type: string
        }
        Update: {
          active?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          params?: Json
          severity?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_rules_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          account_status: string | null
          business_id: string | null
          business_name: string | null
          company_id: string | null
          connected_by_user_id: string | null
          connected_by_user_name: string | null
          created_at: string | null
          data_source: string | null
          facebook_user_id: string | null
          facebook_user_name: string | null
          id: string
          last_full_sync: string | null
          last_sync: string | null
          platform: string
          refresh_token: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          account_status?: string | null
          business_id?: string | null
          business_name?: string | null
          company_id?: string | null
          connected_by_user_id?: string | null
          connected_by_user_name?: string | null
          created_at?: string | null
          data_source?: string | null
          facebook_user_id?: string | null
          facebook_user_name?: string | null
          id?: string
          last_full_sync?: string | null
          last_sync?: string | null
          platform: string
          refresh_token?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          account_status?: string | null
          business_id?: string | null
          business_name?: string | null
          company_id?: string | null
          connected_by_user_id?: string | null
          connected_by_user_name?: string | null
          created_at?: string | null
          data_source?: string | null
          facebook_user_id?: string | null
          facebook_user_name?: string | null
          id?: string
          last_full_sync?: string | null
          last_sync?: string | null
          platform?: string
          refresh_token?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_rules: {
        Row: {
          active: boolean | null
          company_id: string
          created_at: string | null
          id: string
          match_type: string
          name: string
          priority: number | null
          tag: string | null
          type: string
          value: string
        }
        Insert: {
          active?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          match_type: string
          name: string
          priority?: number | null
          tag?: string | null
          type: string
          value: string
        }
        Update: {
          active?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          match_type?: string
          name?: string
          priority?: number | null
          tag?: string | null
          type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_rules_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          link: string | null
          message: string
          metadata: Json | null
          read: boolean | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          read?: boolean | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_sessions: {
        Row: {
          access_token: string
          accounts: Json
          created_at: string | null
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          access_token: string
          accounts: Json
          created_at?: string | null
          expires_at: string
          id: string
          user_id: string
        }
        Update: {
          access_token?: string
          accounts?: Json
          created_at?: string | null
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_benchmarks: {
        Row: {
          company_id: string | null
          conversions_min: number | null
          conversions_target: number | null
          cpc_max: number | null
          cpc_target: number | null
          created_at: string | null
          ctr_min: number | null
          ctr_target: number | null
          id: number
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          conversions_min?: number | null
          conversions_target?: number | null
          cpc_max?: number | null
          cpc_target?: number | null
          created_at?: string | null
          ctr_min?: number | null
          ctr_target?: number | null
          id?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          conversions_min?: number | null
          conversions_target?: number | null
          cpc_max?: number | null
          cpc_target?: number | null
          created_at?: string | null
          ctr_min?: number | null
          ctr_target?: number | null
          id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_benchmarks_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          app_id: string | null
          app_secret: string | null
          created_at: string | null
          id: string
          is_configured: boolean | null
          platform: string
          redirect_uri: string | null
          updated_at: string | null
        }
        Insert: {
          app_id?: string | null
          app_secret?: string | null
          created_at?: string | null
          id?: string
          is_configured?: boolean | null
          platform: string
          redirect_uri?: string | null
          updated_at?: string | null
        }
        Update: {
          app_id?: string | null
          app_secret?: string | null
          created_at?: string | null
          id?: string
          is_configured?: boolean | null
          platform?: string
          redirect_uri?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      policies: {
        Row: {
          accent_color: string | null
          brand_guidelines: string | null
          brand_name: string | null
          campaign_ids: Json | null
          company_id: string | null
          conversions_min: number | null
          conversions_target: number | null
          cpc_max: number | null
          cpc_target: number | null
          created_at: string | null
          ctr_min: number | null
          ctr_target: number | null
          description: string | null
          id: string
          is_default: boolean | null
          logo_url: string | null
          max_text_length: number | null
          min_text_length: number | null
          name: string
          primary_color: string | null
          prohibited_keywords: Json | null
          prohibited_phrases: Json | null
          required_keywords: Json | null
          required_phrases: Json | null
          requires_brand_colors: boolean | null
          requires_logo: boolean | null
          scope: string | null
          secondary_color: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          brand_guidelines?: string | null
          brand_name?: string | null
          campaign_ids?: Json | null
          company_id?: string | null
          conversions_min?: number | null
          conversions_target?: number | null
          cpc_max?: number | null
          cpc_target?: number | null
          created_at?: string | null
          ctr_min?: number | null
          ctr_target?: number | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          logo_url?: string | null
          max_text_length?: number | null
          min_text_length?: number | null
          name: string
          primary_color?: string | null
          prohibited_keywords?: Json | null
          prohibited_phrases?: Json | null
          required_keywords?: Json | null
          required_phrases?: Json | null
          requires_brand_colors?: boolean | null
          requires_logo?: boolean | null
          scope?: string | null
          secondary_color?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          brand_guidelines?: string | null
          brand_name?: string | null
          campaign_ids?: Json | null
          company_id?: string | null
          conversions_min?: number | null
          conversions_target?: number | null
          cpc_max?: number | null
          cpc_target?: number | null
          created_at?: string | null
          ctr_min?: number | null
          ctr_target?: number | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          logo_url?: string | null
          max_text_length?: number | null
          min_text_length?: number | null
          name?: string
          primary_color?: string | null
          prohibited_keywords?: Json | null
          prohibited_phrases?: Json | null
          required_keywords?: Json | null
          required_phrases?: Json | null
          requires_brand_colors?: boolean | null
          requires_logo?: boolean | null
          scope?: string | null
          secondary_color?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policies_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_organization_id: string | null
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_organization_id?: string | null
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_organization_id?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_organization_id_fkey"
            columns: ["current_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      search_terms: {
        Row: {
          ad_group_id: string | null
          campaign_id: string | null
          company_id: string
          created_at: string | null
          date: string | null
          id: string
          metrics: Json | null
          term: string
        }
        Insert: {
          ad_group_id?: string | null
          campaign_id?: string | null
          company_id: string
          created_at?: string | null
          date?: string | null
          id?: string
          metrics?: Json | null
          term: string
        }
        Update: {
          ad_group_id?: string | null
          campaign_id?: string | null
          company_id?: string
          created_at?: string | null
          date?: string | null
          id?: string
          metrics?: Json | null
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_terms_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_terms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          expire: string
          sess: Json
          sid: string
        }
        Insert: {
          expire: string
          sess: Json
          sid: string
        }
        Update: {
          expire?: string
          sess?: Json
          sid?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          annual_pricing: number | null
          billing_cycle: string
          created_at: string | null
          description: string | null
          display_order: number | null
          enable_trial: boolean | null
          features: Json | null
          id: string
          investment_range: string | null
          is_active: boolean | null
          is_popular: boolean | null
          max_audits_per_month: number
          max_campaigns: number
          max_integrations: number | null
          max_users: number
          monthly_pricing: number | null
          name: string
          price: number
          slug: string
          updated_at: string | null
        }
        Insert: {
          annual_pricing?: number | null
          billing_cycle?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          enable_trial?: boolean | null
          features?: Json | null
          id?: string
          investment_range?: string | null
          is_active?: boolean | null
          is_popular?: boolean | null
          max_audits_per_month: number
          max_campaigns: number
          max_integrations?: number | null
          max_users: number
          monthly_pricing?: number | null
          name: string
          price: number
          slug: string
          updated_at?: string | null
        }
        Update: {
          annual_pricing?: number | null
          billing_cycle?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          enable_trial?: boolean | null
          features?: Json | null
          id?: string
          investment_range?: string | null
          is_active?: boolean | null
          is_popular?: boolean | null
          max_audits_per_month?: number
          max_campaigns?: number
          max_integrations?: number | null
          max_users?: number
          monthly_pricing?: number | null
          name?: string
          price?: number
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          ad_sets_synced: number | null
          campaigns_synced: number | null
          company_id: string | null
          completed_at: string | null
          creatives_synced: number | null
          detailed_log: string | null
          error_message: string | null
          id: string
          integration_id: string
          metadata: Json | null
          started_at: string
          status: string
          type: string
        }
        Insert: {
          ad_sets_synced?: number | null
          campaigns_synced?: number | null
          company_id?: string | null
          completed_at?: string | null
          creatives_synced?: number | null
          detailed_log?: string | null
          error_message?: string | null
          id?: string
          integration_id: string
          metadata?: Json | null
          started_at?: string
          status: string
          type: string
        }
        Update: {
          ad_sets_synced?: number | null
          campaigns_synced?: number | null
          company_id?: string | null
          completed_at?: string | null
          creatives_synced?: number | null
          detailed_log?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_history_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_history_integration_id_integrations_id_fk"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          entity_type: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          entity_type: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          entity_type?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          last_name: string | null
          password: string
          profile_image_url: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          password: string
          profile_image_url?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          password?: string
          profile_image_url?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_companies_id_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          action: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          external_id: string | null
          id: string
          object_type: string | null
          payload: Json
          platform: string
          processed: boolean | null
          processed_at: string | null
          received_at: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          object_type?: string | null
          payload: Json
          platform: string
          processed?: boolean | null
          processed_at?: string | null
          received_at?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          object_type?: string | null
          payload?: Json
          platform?: string
          processed?: boolean | null
          processed_at?: string | null
          received_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_company_id: { Args: never; Returns: string }
      current_user_organization_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
    }
    Enums: {
      company_status: "active" | "suspended" | "trial" | "cancelled"
      notification_type:
        | "audit_completed"
        | "audit_failed"
        | "policy_violation"
        | "sync_completed"
        | "sync_failed"
        | "system_alert"
        | "welcome"
      subscription_plan: "free" | "starter" | "professional" | "enterprise"
      user_role: "super_admin" | "company_admin" | "operador"
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
    Enums: {
      company_status: ["active", "suspended", "trial", "cancelled"],
      notification_type: [
        "audit_completed",
        "audit_failed",
        "policy_violation",
        "sync_completed",
        "sync_failed",
        "system_alert",
        "welcome",
      ],
      subscription_plan: ["free", "starter", "professional", "enterprise"],
      user_role: ["super_admin", "company_admin", "operador"],
    },
  },
} as const
