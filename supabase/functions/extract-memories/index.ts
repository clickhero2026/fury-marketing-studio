import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Memory Extraction Pipeline (async, fire-and-forget)
 *
 * Chamada após cada conversa. Usa GPT-4o-mini para:
 * 1. Extrair fatos, preferências, workflows da conversa
 * 2. Gerar embeddings via text-embedding-3-small
 * 3. Deduplicar contra memórias existentes
 * 4. Gerar summary da conversa (memória episódica)
 */

const OPENAI_URL = 'https://api.openai.com/v1';

const EXTRACTION_PROMPT = `Voce e um sistema de extracao de memoria para um assistente de marketing Meta Ads.

Analise a conversa e extraia fatos discretos e reutilizaveis sobre o usuario.

Regras:
1. Extraia APENAS informacoes uteis em conversas FUTURAS
2. Cada memoria deve ser um fato autonomo (compreensivel sem contexto)
3. Seja especifico — "usuario tem 12 campanhas ativas no Meta" NAO "usuario tem campanhas"
4. NAO extraia: saudacoes, agradecimentos, fluxo da conversa, perguntas unicas
5. Prefira as palavras do usuario para preferencias
6. Se a conversa nao tem nada util para lembrar, retorne array vazio

Categorias validas: campaigns, budget, creatives, account, workflow, goals, preferences, industry

Para cada memoria, atribua:
- importance (1-10): quanto a memoria impacta decisoes futuras (10 = critica, 1 = trivial)
- confidence (0.0-1.0): quanto voce esta certo do fato (1.0 = usuario disse explicitamente, 0.5 = inferido com risco, 0.3 = especulacao)
- source:
  - "declared": usuario afirmou de forma direta ("eu trabalho com e-commerce")
  - "observed": deduzido de comportamento ou dados ("o usuario consultou ROAS 5 vezes esta semana")
  - "inferred": deducao indireta com salto logico ("provavelmente prefere video por ter so videos ativos")

Responda APENAS com JSON valido:
{
  "memories": [
    {
      "content": "fato em linguagem natural",
      "memory_type": "fact | preference | procedure | episode | profile",
      "category": "uma das categorias acima",
      "importance": 1-10,
      "confidence": 0.0-1.0,
      "source": "declared | observed | inferred",
      "supersedes_content": null
    }
  ]
}

Se nao ha memorias relevantes, retorne: {"memories": []}`;

Deno.serve(async (req) => {
  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id required' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

    // 1. Buscar conversa e mensagens
    const { data: conversation } = await supabase
      .from('chat_conversations')
      .select('user_id, company_id')
      .eq('id', conversation_id)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('id, role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    if (!messages || messages.length < 2) {
      return new Response(JSON.stringify({ extracted: 0, reason: 'too few messages' }));
    }

    // Sprint A3: capturamos os IDs pra evidence trail
    const evidenceMessageIds: string[] = (messages as Array<{ id: string }>).map((m) => m.id);

    // 2. Buscar memórias existentes para dedup
    const { data: existingMemories } = await supabase
      .from('memories')
      .select('content, memory_type, category')
      .eq('user_id', conversation.user_id)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .limit(40);

    const conversationText = messages
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');

    const existingText = (existingMemories ?? [])
      .map((m: { memory_type: string; category: string; content: string }) =>
        `[${m.memory_type}/${m.category}] ${m.content}`
      )
      .join('\n');

    // 3. Chamar GPT-4o-mini para extração
    const extractionResp = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          {
            role: 'user',
            content: `## Memorias Existentes\n${existingText || 'Nenhuma ainda.'}\n\n## Conversa para Analisar\n${conversationText}`,
          },
        ],
      }),
    });

    const extractionResult = await extractionResp.json();
    const parsed = JSON.parse(extractionResult.choices[0].message.content);
    const newMemories = parsed.memories ?? [];

    // 4. Para cada memória: gerar embedding + salvar
    let savedCount = 0;
    for (const mem of newMemories) {
      // Gerar embedding
      const embResp = await fetch(`${OPENAI_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: mem.content,
        }),
      });

      const embResult = await embResp.json();
      const embedding = embResult.data?.[0]?.embedding;
      if (!embedding) continue;

      // Sprint A3: localizar memorias supersededas (antes de desativar)
      // pra depois setar superseded_by = id_da_nova
      let supersededIds: string[] = [];
      if (mem.supersedes_content) {
        const { data: oldOnes } = await supabase
          .from('memories')
          .select('id')
          .eq('user_id', conversation.user_id)
          .eq('is_active', true)
          .ilike('content', `%${mem.supersedes_content.substring(0, 40)}%`);
        supersededIds = (oldOnes ?? []).map((o: { id: string }) => o.id);

        if (supersededIds.length > 0) {
          await supabase
            .from('memories')
            .update({ is_active: false })
            .in('id', supersededIds);
        }
      }

      // Verificar duplicata por similaridade (threshold 0.92)
      const { data: similar } = await supabase.rpc('search_memories', {
        p_user_id: conversation.user_id,
        p_query_embedding: embedding,
        p_limit: 1,
      });

      if (similar && similar.length > 0 && similar[0].similarity > 0.92) {
        // Duplicata — atualizar importância se maior
        if (mem.importance > similar[0].importance) {
          await supabase
            .from('memories')
            .update({ importance: mem.importance, updated_at: new Date().toISOString() })
            .eq('id', similar[0].id);
        }
        continue;
      }

      // Inserir nova memória (Sprint A4: confidence + source vem do LLM, fallback proxy)
      const importance = mem.importance ?? 5;
      const llmConfidence = typeof mem.confidence === 'number' ? mem.confidence : null;
      const confidence = llmConfidence !== null
        ? Math.max(0, Math.min(1, llmConfidence))
        : Math.max(0, Math.min(1, importance / 10));
      const validSources = ['declared', 'observed', 'inferred'];
      const source = validSources.includes(mem.source) ? mem.source : 'observed';

      const { data: inserted } = await supabase.from('memories').insert({
        user_id: conversation.user_id,
        company_id: conversation.company_id,
        memory_type: mem.memory_type,
        content: mem.content,
        content_embedding: embedding,
        category: mem.category ?? null,
        importance,
        source_conversation_id: conversation_id,
        confidence,
        source,
        evidence_message_ids: evidenceMessageIds,
      }).select('id').single();

      // Sprint A3: superseded_by chain — apontar memorias antigas para a nova
      if (inserted?.id && supersededIds.length > 0) {
        await supabase
          .from('memories')
          .update({ superseded_by: inserted.id })
          .in('id', supersededIds);
      }

      savedCount++;
    }

    // 5. Gerar summary da conversa (memória episódica)
    const summaryResp = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'Resuma esta conversa em 2-3 frases. Foque em: o que foi perguntado, quais dados foram analisados, e quais decisoes/insights surgiram. Responda no mesmo idioma da conversa.',
          },
          { role: 'user', content: conversationText },
        ],
      }),
    });

    const summaryResult = await summaryResp.json();
    const summary = summaryResult.choices?.[0]?.message?.content ?? null;

    if (summary) {
      await supabase
        .from('chat_conversations')
        .update({ summary })
        .eq('id', conversation_id);
    }

    return new Response(
      JSON.stringify({ extracted: savedCount, summary: !!summary }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Memory extraction error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500 }
    );
  }
});
