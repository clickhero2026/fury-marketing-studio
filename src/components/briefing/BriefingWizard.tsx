// Wizard de briefing pos-cadastro: 6 passos com auto-save e progresso.
// Spec: .kiro/specs/briefing-onboarding/ (task 6.1)

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useBriefing } from '@/hooks/use-briefing';
import { StepBusiness } from './steps/StepBusiness';
import { StepOffers } from './steps/StepOffers';
import { StepAudience } from './steps/StepAudience';
import { StepTone } from './steps/StepTone';
import { StepVisuals } from './steps/StepVisuals';
import { StepProhibitions } from './steps/StepProhibitions';
import {
  audienceStepSchema,
  businessStepSchema,
  toneStepSchema,
  visualStepSchema,
} from '@/lib/briefing-schemas';

type StepNum = 1 | 2 | 3 | 4 | 5 | 6;
const STEP_TITLES: Record<StepNum, string> = {
  1: 'Sobre seu negocio',
  2: 'Suas ofertas',
  3: 'Cliente ideal (ICP)',
  4: 'Tom de voz da sua marca',
  5: 'Identidade visual',
  6: 'O que NAO usar (proibicoes)',
};

const STEP_HELPER: Record<StepNum, string> = {
  1: 'Conta pra IA o que sua empresa faz e onde voce esta nas redes',
  2: 'Produtos ou servicos que voce vende — a IA vai usar pra escrever copy',
  3: 'Quem e a pessoa ideal que compra de voce: idade, lugar, dor, comportamento',
  4: 'Como SUA MARCA fala nos anuncios: formal/casual, palavras que voce usa, palavras que nao quer ver',
  5: 'Suas cores e logo — a IA vai aplicar nos criativos gerados',
  6: 'Palavras, assuntos ou imagens que NUNCA podem aparecer (compliance)',
};

export function BriefingWizard() {
  const { briefing, isLoading, isReadOnly, saveStep } = useBriefing();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<StepNum>(1);
  const [busy, setBusy] = useState(false);
  const progress = useMemo(() => Math.round(((step - 1) / 6) * 100), [step]);

  // Bloqueia members (R6.5 / R1.1)
  if (role && role !== 'owner' && role !== 'admin') {
    return (
      <div className="container max-w-2xl py-12">
        <Alert>
          <AlertDescription>
            Voce nao tem permissao para preencher o briefing. Apenas owner/admin podem editar.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSaveStep = async (
    stepNum: StepNum,
    partial: Record<string, unknown>,
    next: StepNum | 'done',
  ) => {
    setBusy(true);
    try {
      // Validacao por schema do passo (apenas para os passos que escrevem em company_briefings)
      if (stepNum === 1) {
        const parsed = businessStepSchema.safeParse(partial);
        if (!parsed.success) {
          toast({
            title: 'Campos invalidos',
            description: parsed.error.issues[0]?.message ?? 'Revise os campos',
            variant: 'destructive',
          });
          return;
        }
      } else if (stepNum === 3) {
        const parsed = audienceStepSchema.safeParse(partial);
        if (!parsed.success) {
          toast({
            title: 'Campos invalidos',
            description: parsed.error.issues[0]?.message ?? 'Revise os campos',
            variant: 'destructive',
          });
          return;
        }
      } else if (stepNum === 4) {
        const parsed = toneStepSchema.safeParse(partial);
        if (!parsed.success) {
          toast({ title: 'Campos invalidos', variant: 'destructive' });
          return;
        }
      } else if (stepNum === 5) {
        const parsed = visualStepSchema.safeParse(partial);
        if (!parsed.success) {
          toast({ title: 'Paleta invalida', variant: 'destructive' });
          return;
        }
      }

      // Steps 1, 3, 4, 5 escrevem em company_briefings.
      // Steps 2 (offers) e 6 (prohibitions) escrevem nas tabelas filhas direto via seus proprios componentes.
      if ([1, 3, 4, 5].includes(stepNum)) {
        const result = await saveStep(stepNum, partial);
        if (!result.ok) {
          toast({
            title: 'Erro ao salvar',
            description: result.error.kind === 'validation'
              ? `Campos invalidos: ${result.error.fields.join(', ')}`
              : 'Tente novamente',
            variant: 'destructive',
          });
          return;
        }
      }

      if (next === 'done') {
        try { localStorage.removeItem('briefing:skipped-at'); } catch { /* ignore */ }
        toast({ title: 'Briefing salvo', description: 'A IA agora tem contexto do seu negocio.' });
        navigate('/');
      } else {
        setStep(next);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    // R1.6: marca skip por usuario para que Index.tsx nao redirecione de volta.
    // Persistente entre reloads — banner permanece como CTA ate completar.
    try {
      localStorage.setItem('briefing:skipped-at', String(Date.now()));
    } catch { /* ignore — modo privado */ }
    toast({
      title: 'Briefing pendente',
      description: 'Voce pode completar depois pelo menu. Algumas funcoes ficarao bloqueadas ate finalizar.',
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-3xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Briefing — passo {step} de 6: {STEP_TITLES[step]}</CardTitle>
                <CardDescription>{STEP_HELPER[step]}</CardDescription>
              </div>
              <Button variant="ghost" onClick={handleSkip} disabled={busy}>
                Pular por enquanto
              </Button>
            </div>
            <Progress value={progress} className="mt-3" />
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <StepBusiness
                initial={briefing}
                disabled={busy || isReadOnly}
                onSubmit={(data) => handleSaveStep(1, data, 2)}
              />
            )}
            {step === 2 && (
              <StepOffers disabled={busy || isReadOnly} onContinue={() => setStep(3)} onBack={() => setStep(1)} />
            )}
            {step === 3 && (
              <StepAudience
                initial={briefing?.audience ?? {}}
                disabled={busy || isReadOnly}
                onSubmit={(audience) => handleSaveStep(3, { audience }, 4)}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && (
              <StepTone
                initial={briefing?.tone ?? {}}
                disabled={busy || isReadOnly}
                onSubmit={(tone) => handleSaveStep(4, { tone }, 5)}
                onBack={() => setStep(3)}
              />
            )}
            {step === 5 && (
              <StepVisuals
                initial={briefing?.palette ?? {}}
                disabled={busy || isReadOnly}
                onSubmit={(palette) => handleSaveStep(5, { palette }, 6)}
                onBack={() => setStep(4)}
              />
            )}
            {step === 6 && (
              <StepProhibitions
                niche={briefing?.niche ?? null}
                disabled={busy || isReadOnly}
                onComplete={() => handleSaveStep(6, {}, 'done')}
                onBack={() => setStep(5)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
