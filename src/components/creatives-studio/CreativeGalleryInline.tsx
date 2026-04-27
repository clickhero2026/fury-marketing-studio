// Galeria inline de criativos retornados pela tool no chat.
// Spec: ai-creative-generation (task 9.1 — R5.1, R5.2, R5.3, R5.4, R5.5)

import { useState } from 'react';
import { Loader2, Check, Sparkles, Copy, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useCreatives } from '@/hooks/use-creatives';
import { useToast } from '@/hooks/use-toast';
import {
  ASPECT_LABELS,
  PROVIDER_LABELS,
  type Creative,
} from '@/types/creative';
import { CreativeDetailDialog } from './CreativeDetailDialog';
import { supabase } from '@/integrations/supabase/client';

interface InlineCreative {
  id: string;
  signed_url: string;
  format: 'feed_1x1' | 'story_9x16' | 'reels_4x5';
  model_used: 'gemini-2.5-flash-image' | 'gpt-image-1';
  cost_usd?: number;
  is_near_duplicate?: boolean;
  compliance_warning?: boolean;
}

interface CreativeGalleryInlineProps {
  creatives: InlineCreative[];
}

export function CreativeGalleryInline({ creatives }: CreativeGalleryInlineProps) {
  const { isReadOnly, approve, discard, iterate, vary } = useCreatives();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [iterateInstruction, setIterateInstruction] = useState('');
  const [detailCreative, setDetailCreative] = useState<Creative | null>(null);

  if (!creatives || creatives.length === 0) return null;

  const runAction = async (
    id: string,
    label: string,
    fn: () => Promise<{ ok: boolean; error?: { kind: string; message?: string } }>,
  ) => {
    setBusyId(id);
    const r = await fn();
    setBusyId(null);
    toast(r.ok
      ? { title: label, description: 'Concluido.' }
      : { title: 'Erro', description: r.error?.message ?? r.error?.kind ?? 'falhou', variant: 'destructive' });
  };

  const openDetail = async (id: string) => {
    const { data } = await supabase
      .from('creatives_generated' as never)
      .select('*')
      .eq('id', id)
      .single();
    if (data) {
      const row = data as unknown as Creative;
      const { data: signed } = await supabase.storage
        .from('generated-creatives').createSignedUrl(row.storage_path, 3600);
      setDetailCreative({ ...row, signed_url: signed?.signedUrl });
    }
  };

  const submitIterate = async (parentId: string) => {
    if (!iterateInstruction.trim()) return;
    setBusyId(parentId);
    const r = await iterate({
      parent_creative_id: parentId,
      instruction: iterateInstruction.trim(),
      mode: 'iterate',
    });
    setBusyId(null);
    if (r.ok) {
      toast({ title: 'Iterado', description: `${r.value.creatives.length} novo(s) criativo(s).` });
      setIteratingId(null);
      setIterateInstruction('');
    } else {
      toast({ title: 'Erro', description: r.error.kind, variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-3">
        {creatives.map((c) => {
          const aspect = ASPECT_LABELS[c.format];
          const aspectClass = c.format === 'feed_1x1' ? 'aspect-square'
            : c.format === 'story_9x16' ? 'aspect-[9/16]'
            : 'aspect-[4/5]';
          const isBusy = busyId === c.id;

          return (
            <div key={c.id} className="rounded-xl border border-border bg-card/50 overflow-hidden flex flex-col">
              <button
                type="button"
                onClick={() => openDetail(c.id)}
                className={`${aspectClass} bg-muted/40 overflow-hidden relative group`}
              >
                <img src={c.signed_url} alt="criativo" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                {c.compliance_warning && (
                  <Badge variant="destructive" className="absolute top-1 left-1 gap-1">
                    <AlertTriangle className="h-3 w-3" />
                  </Badge>
                )}
              </button>

              <div className="p-2 space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px]">{aspect.ratio}</Badge>
                  <Badge variant="outline" className="text-[10px]">{PROVIDER_LABELS[c.model_used]}</Badge>
                  {c.is_near_duplicate && <Badge variant="outline" className="text-[10px]">~dup</Badge>}
                </div>

                {iteratingId === c.id ? (
                  <div className="space-y-1">
                    <Textarea
                      value={iterateInstruction}
                      onChange={(e) => setIterateInstruction(e.target.value)}
                      placeholder="Mudanca desejada..."
                      rows={2}
                      maxLength={2000}
                      className="text-xs"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs flex-1"
                              onClick={() => submitIterate(c.id)}
                              disabled={isBusy || !iterateInstruction.trim()}>
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enviar'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => { setIteratingId(null); setIterateInstruction(''); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" variant="default" className="h-7 text-[11px]"
                            onClick={() => runAction(c.id, 'Aprovado', () => approve(c.id))}
                            disabled={isReadOnly || isBusy}>
                      <Check className="h-3 w-3 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                            onClick={() => setIteratingId(c.id)}
                            disabled={isReadOnly || isBusy}>
                      <Sparkles className="h-3 w-3 mr-1" /> Iterar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                            onClick={() => runAction(c.id, 'Variado', () => vary(c.id))}
                            disabled={isReadOnly || isBusy}>
                      <Copy className="h-3 w-3 mr-1" /> Variar 3x
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive"
                            onClick={() => runAction(c.id, 'Descartado', async () => {
                              const r = await discard(c.id);
                              return r.ok ? { ok: true } : { ok: false, error: r.error };
                            })}
                            disabled={isReadOnly || isBusy}>
                      <Trash2 className="h-3 w-3 mr-1" /> Descartar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CreativeDetailDialog
        creative={detailCreative}
        open={!!detailCreative}
        onOpenChange={(o) => !o && setDetailCreative(null)}
      />
    </>
  );
}
