export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_access_grants: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          label: string;
          role: string;
          telegram_user_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          label: string;
          role?: string;
          telegram_user_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          label?: string;
          role?: string;
          telegram_user_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_movements: {
        Row: {
          amount: number | null;
          cancel_reason: string | null;
          canceled_at: string | null;
          canceled_by_owner: string | null;
          created_at: string;
          currency: string | null;
          id: string;
          recipient_handle: string | null;
          status: string;
          stripe_event_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_session_id: string | null;
          stripe_subscription_id: string | null;
          telegram_user_id: number | null;
          title: string;
          type: string;
          web_user_id: string | null;
        };
        Insert: {
          amount?: number | null;
          cancel_reason?: string | null;
          canceled_at?: string | null;
          canceled_by_owner?: string | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          recipient_handle?: string | null;
          status: string;
          stripe_event_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          stripe_subscription_id?: string | null;
          telegram_user_id?: number | null;
          title: string;
          type: string;
          web_user_id?: string | null;
        };
        Update: {
          amount?: number | null;
          cancel_reason?: string | null;
          canceled_at?: string | null;
          canceled_by_owner?: string | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          recipient_handle?: string | null;
          status?: string;
          stripe_event_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          stripe_subscription_id?: string | null;
          telegram_user_id?: number | null;
          title?: string;
          type?: string;
          web_user_id?: string | null;
        };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: {
          id: string;
          payload: Json | null;
          processed_at: string;
          type: string;
        };
        Insert: {
          id: string;
          payload?: Json | null;
          processed_at?: string;
          type: string;
        };
        Update: {
          id?: string;
          payload?: Json | null;
          processed_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          plan_id: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          telegram_user_id: number;
          telegram_username: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          plan_id: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          telegram_user_id: number;
          telegram_username?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          plan_id?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          telegram_user_id?: number;
          telegram_username?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      vip_plans: {
        Row: {
          active: boolean;
          amount_cents: number;
          created_at: string;
          currency: string;
          description: string;
          featured: boolean;
          name: string;
          perks: string[];
          plan_id: string;
          sort_order: number;
          stripe_price_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          amount_cents: number;
          created_at?: string;
          currency?: string;
          description?: string;
          featured?: boolean;
          name: string;
          perks?: string[];
          plan_id: string;
          sort_order?: number;
          stripe_price_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          amount_cents?: number;
          created_at?: string;
          currency?: string;
          description?: string;
          featured?: boolean;
          name?: string;
          perks?: string[];
          plan_id?: string;
          sort_order?: number;
          stripe_price_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
