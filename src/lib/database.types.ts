export interface Database {
  public: {
    Tables: {
      repositories: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      commits: {
        Row: {
          id: string;
          repository_id: string;
          message: string;
          author: string;
          committed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          repository_id: string;
          message: string;
          author: string;
          committed_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          repository_id?: string;
          message?: string;
          author?: string;
          committed_at?: string;
          created_at?: string;
        };
      };
      issues: {
        Row: {
          id: string;
          repository_id: string;
          title: string;
          author: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          repository_id: string;
          title: string;
          author: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          repository_id?: string;
          title?: string;
          author?: string;
          created_at?: string;
        };
      };
      pull_requests: {
        Row: {
          id: string;
          repository_id: string;
          title: string;
          author: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          repository_id: string;
          title: string;
          author: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          repository_id?: string;
          title?: string;
          author?: string;
          created_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          repository_id: string;
          comment: string;
          author: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          repository_id: string;
          comment: string;
          author: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          repository_id?: string;
          comment?: string;
          author?: string;
          created_at?: string;
        };
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
  };
}