// Passo 2 do wizard — Ofertas. Spec: briefing-onboarding (task 6.3)

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBriefing } from '@/hooks/use-briefing';
import { offerSchema } from '@/lib/briefing-schemas';
import type { CompanyOffer, OfferFormat } from '@/types/briefing';

interface StepOffersProps {
  disabled?: boolean;
  onContinue: () => void;
  onBack: () => void;
}

interface DraftOffer {
  name: string;
  short_description: string;
  price: string;
  format: OfferFormat;
  sales_url: string;
  is_primary: boolean;
}

const EMPTY_DRAFT: DraftOffer = {
  name: '',
  short_description: '',
  price: '',
  format: 'course',
  sales_url: '',
  is_primary: false,
};

export function StepOffers({ disabled, onContinue, onBack }: StepOffersProps) {
  const { offers, upsertOffer, removeOffer, promoteOfferToPrimary } = useBriefing();
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftOffer>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hasPrimary = offers.some((o) => o.is_primary);

  const startEdit = (o: CompanyOffer) => {
    setEditingId(o.id);
    setDraft({
      name: o.name,
      short_description: o.short_description,
      price: String(o.price),
      format: o.format,
      sales_url: o.sales_url ?? '',
      is_primary: o.is_primary,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const handleSave = async () => {
    const priceNum = parseFloat(draft.price.replace(',', '.'));
    const parsed = offerSchema.safeParse({
      ...(editingId ? { id: editingId } : {}),
      name: draft.name,
      short_description: draft.short_description,
      price: priceNum,
      format: draft.format,
      sales_url: draft.sales_url || undefined,
      is_primary: !hasPrimary || draft.is_primary,
      currency: 'BRL',
      pains_resolved: [],
      benefits: [],
      social_proof: {},
      position: editingId ? offers.find((o) => o.id === editingId)?.position ?? 0 : offers.length,
    });
    if (!parsed.success) {
      toast({
        title: 'Campos invalidos',
        description: parsed.error.issues[0]?.message ?? 'Revise nome, descricao e preco',
        variant: 'destructive',
      });
      return;
    }
    if (offers.filter((o) => !o.is_primary).length >= 10 && !editingId && !parsed.data.is_primary) {
      toast({ title: 'Limite atingido', description: 'Maximo de 10 ofertas secundarias', variant: 'destructive' });
      return;
    }
    const result = await upsertOffer(parsed.data);
    if (!result.ok) {
      toast({ title: 'Erro ao salvar oferta', variant: 'destructive' });
      return;
    }
    cancelEdit();
  };

  const handleRemove = async (id: string) => {
    const result = await removeOffer(id);
    if (!result.ok && result.error.kind === 'conflict') {
      toast({
        title: 'Promova outra oferta antes',
        description: 'Voce nao pode remover a oferta principal sem promover outra',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {offers.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma oferta cadastrada. Adicione ao menos uma oferta principal.</p>
        )}
        {offers.map((o) => (
          <Card key={o.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{o.name}</span>
                  {o.is_primary && (
                    <Badge variant="default">
                      <Star className="h-3 w-3 mr-1" /> Principal
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {o.short_description} · R$ {Number(o.price).toFixed(2)}
                </p>
              </div>
              <div className="flex gap-1">
                {!o.is_primary && (
                  <Button size="sm" variant="ghost" onClick={() => promoteOfferToPrimary(o.id)} disabled={disabled}>
                    Tornar principal
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => startEdit(o)} disabled={disabled}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleRemove(o.id)} disabled={disabled}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-medium">{editingId ? 'Editando oferta' : (hasPrimary ? 'Adicionar oferta secundaria' : 'Cadastrar oferta principal')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={disabled} maxLength={120} />
            </div>
            <div>
              <Label>Preco (BRL) *</Label>
              <Input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="0,00" disabled={disabled} />
            </div>
          </div>
          <div>
            <Label>Descricao curta *</Label>
            <Textarea value={draft.short_description} onChange={(e) => setDraft({ ...draft, short_description: e.target.value })} disabled={disabled} maxLength={280} rows={2} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Formato</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3"
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value as OfferFormat })}
                disabled={disabled}
              >
                <option value="course">Curso</option>
                <option value="service">Servico</option>
                <option value="physical">Produto fisico</option>
                <option value="saas">SaaS</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <Label>URL de venda</Label>
              <Input value={draft.sales_url} onChange={(e) => setDraft({ ...draft, sales_url: e.target.value })} placeholder="https://..." disabled={disabled} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={disabled}>
              <Plus className="h-4 w-4 mr-2" /> {editingId ? 'Salvar' : 'Adicionar'}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={cancelEdit} disabled={disabled}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} disabled={disabled}>Voltar</Button>
        <Button onClick={onContinue} disabled={!hasPrimary || disabled}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
