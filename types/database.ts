export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          file_path: string;
          page_count: number;
          size_bytes: number;
          mime_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          file_path: string;
          page_count: number;
          size_bytes: number;
          mime_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          file_path?: string;
          page_count?: number;
          size_bytes?: number;
          mime_type?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      links: {
        Row: {
          id: string;
          document_id: string;
          slug: string;
          recipient_name: string | null;
          recipient_email: string | null;
          expires_at: string | null;
          max_views: number | null;
          revoked: boolean;
          created_at: string;
        };
        // password_hash is deliberately absent: authenticated sessions have no
        // SELECT privilege on it. Server-only code reads it with the admin client.
        Insert: {
          id?: string;
          document_id: string;
          slug: string;
          recipient_name?: string | null;
          recipient_email?: string | null;
          password_hash?: string | null;
          expires_at?: string | null;
          max_views?: number | null;
          revoked?: boolean;
          created_at?: string;
        };
        Update: {
          document_id?: string;
          slug?: string;
          recipient_name?: string | null;
          recipient_email?: string | null;
          password_hash?: string | null;
          expires_at?: string | null;
          max_views?: number | null;
          revoked?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "links_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      views: {
        Row: {
          id: string;
          link_id: string;
          started_at: string;
          last_seen_at: string;
          device: string | null;
          browser: string | null;
          os: string | null;
          country: string | null;
          city: string | null;
          referrer: string | null;
        };
        Insert: {
          id?: string;
          link_id: string;
          started_at?: string;
          last_seen_at?: string;
          device?: string | null;
          browser?: string | null;
          os?: string | null;
          country?: string | null;
          city?: string | null;
          referrer?: string | null;
        };
        Update: {
          link_id?: string;
          started_at?: string;
          last_seen_at?: string;
          device?: string | null;
          browser?: string | null;
          os?: string | null;
          country?: string | null;
          city?: string | null;
          referrer?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "views_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "links";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: number;
          view_id: string;
          link_id: string;
          client_event_id: string | null;
          event_type: Database["public"]["Enums"]["event_type"];
          page: number | null;
          duration_ms: number | null;
          scroll_depth: number | null;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          view_id: string;
          // Derived from views.link_id by a trigger. Never send it — an
          // inconsistent value would be silently overwritten anyway.
          link_id?: string;
          client_event_id?: string | null;
          event_type: Database["public"]["Enums"]["event_type"];
          page?: number | null;
          duration_ms?: number | null;
          scroll_depth?: number | null;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          client_event_id?: string | null;
          event_type?: Database["public"]["Enums"]["event_type"];
          page?: number | null;
          duration_ms?: number | null;
          scroll_depth?: number | null;
          meta?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "events_view_id_fkey";
            columns: ["view_id"];
            isOneToOne: false;
            referencedRelation: "views";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "links";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      event_type:
        | "open"
        | "page_enter"
        | "page_leave"
        | "scroll"
        | "click"
        | "download"
        | "print"
        | "copy"
        | "tab_hidden"
        | "tab_visible"
        | "close";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type DocumentRow = Tables<"documents">;
export type LinkRow = Tables<"links">;
export type ViewRow = Tables<"views">;
export type EventRow = Tables<"events">;
export type EventType = Database["public"]["Enums"]["event_type"];
