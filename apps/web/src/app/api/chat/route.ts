import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Lazy-initialized clients to avoid build-time errors
let supabase: SupabaseClient | null = null;
let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

function getAnthropic() {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

function getOpenAI() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

const RAG_SYSTEM_PROMPT = `You are a knowledge synthesis assistant with access to the user's personal knowledge base. This archive contains research papers, articles, tweets, and content they've saved because they found it valuable.

Your role is NOT just to search and retrieve - it's to help the user LEVERAGE their knowledge base for deeper understanding and action.

When responding:

1. **Synthesize across sources** - Don't just summarize individual items. Find patterns, connections, and themes across multiple pieces of content.

2. **Extract actionable insights** - What are the key takeaways? What can be applied? What should the user do with this knowledge?

3. **Build on the knowledge** - Help the user develop their thinking. Connect ideas, identify gaps, suggest directions for further exploration.

4. **Be specific and cite sources** - Reference specific content by title/author. Quote key passages when relevant.

5. **Think like a research assistant** - If asked to analyze papers, actually analyze them. Extract methodologies, findings, implications. Don't just list what exists.

6. **Identify patterns and contradictions** - When multiple sources touch on similar topics, note where they agree, disagree, or complement each other.

The user has curated this knowledge base intentionally. Help them get maximum value from it - not just finding information, but understanding it deeply and putting it to use.`;

const DEEP_RESEARCH_PROMPT = `You are conducting deep research across the user's knowledge base. This is a comprehensive analysis task.

Your job is to:
1. **Thoroughly analyze** all provided content - read it carefully, not superficially
2. **Synthesize key learnings** - What are the most important insights across all sources?
3. **Extract action items** - What should the user do based on this knowledge?
4. **Identify themes and patterns** - What threads connect these pieces?
5. **Note gaps and opportunities** - What's missing? What would strengthen the knowledge base?
6. **Create a structured output** - Organize your findings clearly with sections for insights, actions, themes, etc.

Be comprehensive but focused. The user wants to deeply understand and act on their saved knowledge, not just get a surface-level summary.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Source {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
  summary: string | null;
}

const ITEM_CONTEXT_PROMPT = `You are helping the user explore a specific piece of content from their knowledge base.

The PRIMARY CONTENT being discussed is provided first, followed by related content from their archive.

Focus your responses on:
1. **Explaining and elaborating** on the primary content - answer questions about it directly
2. **Making connections** to related items in the knowledge base
3. **Providing deeper analysis** - extract insights, implications, and applications
4. **Building context** - help the user understand how this fits into broader themes

Be specific and reference the content directly. The user saved this content intentionally - help them get maximum value from it.`;

/**
 * Chat API with RAG (Retrieval Augmented Generation)
 * POST /api/chat
 * Body: {
 *   message: string,
 *   conversationHistory?: Message[],
 *   deepResearch?: boolean,  // Enable deep research mode for comprehensive analysis
 *   itemId?: string,         // Focus chat on a specific item
 *   topicFilter?: string     // Scope search to a specific topic
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const {
      message,
      conversationHistory = [],
      deepResearch = false,
      itemId,
      topicFilter,
    } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Configure based on mode
    const retrievalCount = deepResearch ? 20 : 10; // More context for deep research
    const matchThreshold = deepResearch ? 0.25 : 0.3; // Lower threshold to catch more relevant content
    const maxTokens = deepResearch ? 4096 : 2048; // Longer responses for comprehensive analysis

    // Select system prompt based on context
    let systemPrompt = deepResearch ? DEEP_RESEARCH_PROMPT : RAG_SYSTEM_PROMPT;
    if (itemId) {
      systemPrompt = ITEM_CONTEXT_PROMPT;
    }

    // 1. Generate embedding for the user's question
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
      dimensions: 1536,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Retrieve relevant context from the knowledge base
    let results: Record<string, unknown>[] = [];
    let primaryItem: Record<string, unknown> | null = null;

    // If itemId is provided, fetch that item first and find similar items
    if (itemId) {
      // Fetch the primary item
      const { data: item, error: itemError } = await getSupabase()
        .from('content_items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (itemError) {
        console.error('Error fetching item:', itemError);
      } else {
        primaryItem = item;

        // Get similar items using the database function
        const { data: similarItems, error: similarError } = await getSupabase().rpc(
          'get_similar_content',
          {
            content_id: itemId,
            match_count: retrievalCount - 1,
          }
        );

        if (similarError) {
          console.error('Error getting similar items:', similarError);
        }

        // Filter by topic if specified
        let filteredSimilar = similarItems || [];
        if (topicFilter) {
          filteredSimilar = filteredSimilar.filter(
            (item: Record<string, unknown>) =>
              Array.isArray(item.topics) && item.topics.includes(topicFilter)
          );
        }

        results = filteredSimilar;
      }
    } else {
      // Standard semantic search
      const { data: searchResults, error: searchError } = await getSupabase().rpc(
        'search_content_semantic',
        {
          query_embedding: `[${queryEmbedding.join(',')}]`,
          match_threshold: matchThreshold,
          match_count: retrievalCount,
        }
      );

      if (searchError) {
        console.error('Semantic search error:', searchError);
      }

      // Filter by topic if specified
      results = searchResults || [];
      if (topicFilter) {
        results = results.filter(
          (item: Record<string, unknown>) =>
            Array.isArray(item.topics) && item.topics.includes(topicFilter)
        );
      }
    }

    // 3. Format context for Claude - include more content in deep research mode
    const contentLimit = deepResearch ? 2000 : 800; // More content per item for deep research

    // Helper function to format a single item
    const formatItem = (item: Record<string, unknown>, index: number, isPrimary = false) => {
      const bodyText = typeof item.body_text === 'string' ? item.body_text : '';
      const summary = item.summary as string || '';
      const description = item.description as string || '';

      // For primary item or deep research, include more content
      const limit = isPrimary ? 3000 : contentLimit;
      const contentPreview = (isPrimary || deepResearch)
        ? bodyText.slice(0, limit) || summary || description
        : summary || description || bodyText.slice(0, limit);

      const prefix = isPrimary ? '⭐ PRIMARY CONTENT' : `[${index}]`;

      let formattedContent = `${prefix} "${item.title || 'Untitled'}" by ${item.author_name || item.author_handle || 'Unknown'}
Source: ${item.source_url}
Topics: ${Array.isArray(item.topics) ? item.topics.join(', ') : 'N/A'}

${contentPreview}${contentPreview.length >= limit ? '...' : ''}`;

      // Include linked content (PDFs, articles) from platform_data if available
      const platformData = item.platform_data as Record<string, unknown> | null;
      if (platformData?.linked_content && Array.isArray(platformData.linked_content)) {
        const linkedContent = platformData.linked_content as Array<{
          url?: string;
          title?: string;
          description?: string;
          bodyText?: string;
          contentType?: string;
        }>;

        if (linkedContent.length > 0) {
          formattedContent += '\n\n📎 LINKED DOCUMENTS:';
          for (const link of linkedContent) {
            if (!link.bodyText && !link.description) continue;

            const linkLimit = isPrimary ? 2000 : 500; // More content for primary item
            const linkContent = link.bodyText?.slice(0, linkLimit) || link.description || '';

            formattedContent += `\n\n--- ${link.title || link.url || 'Linked Document'} (${link.contentType || 'unknown'}) ---\n${linkContent}${linkContent.length >= linkLimit ? '...' : ''}`;
          }
        }
      }

      return formattedContent;
    };

    // Build context with primary item first if specified
    let context = '';
    if (primaryItem) {
      context = formatItem(primaryItem, 0, true);
      if (results.length > 0) {
        context += '\n\n---\n\n## Related Content\n\n';
        context += results
          .map((item, i) => formatItem(item, i + 1))
          .join('\n\n---\n\n');
      }
    } else if (results.length > 0) {
      context = results
        .map((item, i) => formatItem(item, i + 1))
        .join('\n\n---\n\n');
    } else {
      context = 'No relevant content found in the knowledge base.';
    }

    // 4. Build messages for Claude
    const totalItems = (primaryItem ? 1 : 0) + results.length;
    const topicContext = topicFilter ? ` (filtered to topic: ${topicFilter})` : '';

    let userPrompt: string;
    if (itemId && primaryItem) {
      // Item-focused chat
      userPrompt = `I want to explore this specific piece of content from my knowledge base:

${context}

---

My question about this content: ${message}`;
    } else if (deepResearch) {
      userPrompt = `I want you to conduct deep research on the following question using my knowledge base${topicContext}.

Here is the relevant content from my archive (${totalItems} items):

${context}

---

Research request: ${message}

Please provide a comprehensive analysis with:
- Key insights and learnings
- Actionable takeaways
- Patterns and themes across sources
- Any gaps or areas for further exploration`;
    } else {
      userPrompt = `Here is relevant context from my knowledge base${topicContext} (${totalItems} items):

${context}

---

My question: ${message}`;
    }

    const messages: Anthropic.MessageParam[] = [
      // Include conversation history (limited for deep research to save context)
      ...conversationHistory.slice(deepResearch ? -4 : -10).map((msg: Message) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // Add current message with context
      {
        role: 'user' as const,
        content: userPrompt,
      },
    ];

    // 5. Generate response with Claude
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const answer = textBlock?.type === 'text' ? textBlock.text : '';

    // 6. Format sources for the response
    const allItems = primaryItem ? [primaryItem, ...results] : results;
    const sources: Source[] =
      allItems?.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string | null,
        url: r.source_url as string,
        author: (r.author_name || r.author_handle) as string | null,
        summary: r.summary as string | null,
      })) || [];

    return NextResponse.json({
      answer,
      sources,
      mode: itemId ? 'item_context' : deepResearch ? 'deep_research' : 'standard',
      sourcesAnalyzed: totalItems,
      ...(itemId && { focusedItemId: itemId }),
      ...(topicFilter && { topicFilter }),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'Chat failed';
    const isConfigError = message.includes('environment variable');
    return NextResponse.json(
      { error: isConfigError ? 'Chat service is not configured' : 'Chat failed' },
      { status: isConfigError ? 503 : 500 }
    );
  }
}
