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
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return anthropic;
}

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
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

/**
 * Chat API with RAG (Retrieval Augmented Generation)
 * POST /api/chat
 * Body: {
 *   message: string,
 *   conversationHistory?: Message[],
 *   deepResearch?: boolean  // Enable deep research mode for comprehensive analysis
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory = [], deepResearch = false } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Configure based on mode
    const retrievalCount = deepResearch ? 20 : 10; // More context for deep research
    const matchThreshold = deepResearch ? 0.25 : 0.3; // Lower threshold to catch more relevant content
    const maxTokens = deepResearch ? 4096 : 2048; // Longer responses for comprehensive analysis
    const systemPrompt = deepResearch ? DEEP_RESEARCH_PROMPT : RAG_SYSTEM_PROMPT;

    // 1. Generate embedding for the user's question
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
      dimensions: 1536,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Retrieve relevant context from the knowledge base
    const { data: results, error: searchError } = await getSupabase().rpc(
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

    // 3. Format context for Claude - include more content in deep research mode
    const contentLimit = deepResearch ? 2000 : 800; // More content per item for deep research

    const context =
      results && results.length > 0
        ? results
            .map(
              (item: Record<string, unknown>, i: number) => {
                const bodyText = typeof item.body_text === 'string' ? item.body_text : '';
                const summary = item.summary as string || '';
                const description = item.description as string || '';

                // For deep research, include more of the actual content
                const contentPreview = deepResearch
                  ? bodyText.slice(0, contentLimit) || summary || description
                  : summary || description || bodyText.slice(0, contentLimit);

                return `[${i + 1}] "${item.title || 'Untitled'}" by ${item.author_name || item.author_handle || 'Unknown'}
Source: ${item.source_url}
Topics: ${Array.isArray(item.topics) ? item.topics.join(', ') : 'N/A'}

${contentPreview}${contentPreview.length >= contentLimit ? '...' : ''}`;
              }
            )
            .join('\n\n---\n\n')
        : 'No relevant content found in the knowledge base.';

    // 4. Build messages for Claude
    const userPrompt = deepResearch
      ? `I want you to conduct deep research on the following question using my knowledge base.

Here is the relevant content from my archive (${results?.length || 0} items):

${context}

---

Research request: ${message}

Please provide a comprehensive analysis with:
- Key insights and learnings
- Actionable takeaways
- Patterns and themes across sources
- Any gaps or areas for further exploration`
      : `Here is relevant context from my knowledge base (${results?.length || 0} items):

${context}

---

My question: ${message}`;

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
    const sources: Source[] =
      results?.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string | null,
        url: r.source_url as string,
        author: (r.author_name || r.author_handle) as string | null,
        summary: r.summary as string | null,
      })) || [];

    return NextResponse.json({
      answer,
      sources,
      mode: deepResearch ? 'deep_research' : 'standard',
      sourcesAnalyzed: results?.length || 0,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
