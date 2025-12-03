export interface ContentItem {
  id: string;
  source_url: string;
  source_type: 'twitter' | 'instagram' | 'linkedin' | 'pinterest' | 'web';
  title: string | null;
  description: string | null;
  body_text: string | null;
  author_name: string | null;
  author_handle: string | null;
  published_at: string | null;
  images: Array<{
    url?: string;
    publicUrl?: string;
    originalUrl?: string;
    gcsPath?: string;
    alt?: string;
  }> | null;
  videos: Array<{
    url?: string;
    originalUrl?: string;
    thumbnail?: string;
    duration?: number;
  }> | null;
  summary: string | null;
  topics: string[] | null;
  disciplines: string[] | null;
  use_cases: string[] | null;
  content_type: string | null;
  platform_data: Record<string, unknown> | null;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  error_message: string | null;
  captured_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilterOption {
  name: string;
  count: number;
}

export interface FiltersData {
  sourceTypes: FilterOption[];
  topics: FilterOption[];
  disciplines: FilterOption[];
  totalItems: number;
}

export interface ItemsResponse {
  items: ContentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
