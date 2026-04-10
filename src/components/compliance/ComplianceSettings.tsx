import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlacklistManager } from './BlacklistManager';
import { ShieldAlert, Sliders } from 'lucide-react';

interface CompanySettings {
  auto_takedown_enabled: boolean;
  takedown_threshold: number;
}

export function ComplianceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ['company-compliance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('auto_takedown_enabled, takedown_threshold')
        .single();
      if (error) throw error;
      return data as CompanySettings;
    },
  });

  const [saving, setSaving] = useState(false);

  const updateSetting = async (field: keyof CompanySettings, value: boolean | number) => {
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ [field]: value } as never)
      .eq('id', (await supabase.from('companies').select('id').single()).data?.id ?? '');
    setSaving(false);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['company-compliance-settings'] });
      toast({ title: 'Configuracao salva' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Auto-takedown card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Auto-Takedown
          </CardTitle>
          <CardDescription>
            Pausa automaticamente anuncios com score abaixo do threshold. Protege sua conta contra bloqueios da Meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="takedown-toggle" className="font-medium">
              Habilitar pausa automatica
            </Label>
            <Switch
              id="takedown-toggle"
              checked={settings?.auto_takedown_enabled ?? false}
              onCheckedChange={(v) => updateSetting('auto_takedown_enabled', v)}
              disabled={saving}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                Threshold de pausa
              </Label>
              <span className="text-sm font-mono font-bold">{settings?.takedown_threshold ?? 50}/100</span>
            </div>
            <Slider
              value={[settings?.takedown_threshold ?? 50]}
              onValueCommit={(v) => updateSetting('takedown_threshold', v[0])}
              min={10}
              max={90}
              step={5}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Anuncios com score abaixo de {settings?.takedown_threshold ?? 50} serao pausados automaticamente.
              Rate limit: max 10 pausas por hora.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Blacklist manager */}
      <BlacklistManager />
    </div>
  );
}
