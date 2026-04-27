// CitationRenderer — substitui refs `[doc:UUID#chunk:N]` por links clicaveis.
// Spec: knowledge-base-rag (task 8.4 — R6.1, R6.2, R6.3, R6.4)
//
// Uso: envolve uma string da resposta da IA. Detecta refs via CITATION_REGEX,
// substitui por <button> que abre o DocumentDetailDrawer com chunk destacado.
// Refs invalidas (doc nao existe) viram badge "fonte invalida" sem quebrar o resto.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { CITATION_REGEX, type KnowledgeDocument } from '@/types/knowledge';
import { DocumentDetailDrawer } from './DocumentDetailDrawer';

interface Props {
  /** Texto bruto da resposta da IA, possivelmente com `[doc:UUID#chunk:N]`. */
  text: string;
}

interface ParsedRef {
  documentId: string;
  chunkIndex: number;
}

interface Segment {
  type: 'text' | 'ref';
  content: string;
  ref?: ParsedRef;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  // Reset stateful regex
  const regex = new RegExp(CITATION_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'ref',
      content: match[0],
      ref: {
        documentId: match[1],
        chunkIndex: parseInt(match[2], 10),
      },
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

export function CitationRenderer({ text }: Props) {
  const segments = useMemo(() => parseSegments(text), [text]);
  const [openDoc, setOpenDoc] = useState<{ doc: KnowledgeDocument; chunkIndex: number } | null>(null);

  const { company } = useAuth();
  const companyId = company?.id ?? null;

  // Coleta ids unicos de refs para validar batch
  const refIds = useMemo(
    () => Array.from(new Set(segments.filter((s) => s.type === 'ref').map((s) => s.ref!.documentId))),
    [segments],
  );

  const { data: docsById } = useQuery({
    queryKey: ['kb-citation-docs', companyId, refIds.slice().sort().join(',')],
    enabled: !!companyId && refIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, KnowledgeDocument>> => {
      if (!companyId || refIds.length === 0) return {};
      const { data } = await supabase
        .from('knowledge_documents' as never)
        .select('*')
        .in('id', refIds)
        .eq('company_id', companyId);
      const map: Record<string, KnowledgeDocument> = {};
      for (const d of (data as unknown as KnowledgeDocument[]) ?? []) {
        map[d.id] = d;
      }
      return map;
    },
  });

  if (segments.length === 0) return <>{text}</>;

  // Se nao tem nenhuma ref, retorna texto direto
  if (!segments.some((s) => s.type === 'ref')) {
    return <>{text}</>;
  }

  return (
    <>
      <span className="whitespace-pre-wrap">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return <span key={i}>{seg.content}</span>;
          }
          const doc = docsById?.[seg.ref!.documentId];
          if (!doc) {
            return (
              <Badge key={i} variant="destructive" className="mx-1 inline-flex items-center gap-1 align-middle text-xs">
                <AlertCircle className="h-3 w-3" /> fonte invalida
              </Badge>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => setOpenDoc({ doc, chunkIndex: seg.ref!.chunkIndex })}
              className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 align-middle"
              title={`Abrir ${doc.title}, trecho #${seg.ref!.chunkIndex}`}
            >
              <ExternalLink className="h-3 w-3" />
              {doc.title.slice(0, 40)}
              {doc.title.length > 40 && '...'}
            </button>
          );
        })}
      </span>

      <DocumentDetailDrawer
        document={openDoc?.doc ?? null}
        open={!!openDoc}
        onOpenChange={(o) => !o && setOpenDoc(null)}
        highlightChunkIndex={openDoc?.chunkIndex}
      />
    </>
  );
}
