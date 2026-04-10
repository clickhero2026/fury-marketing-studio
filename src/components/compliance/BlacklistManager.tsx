import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useComplianceRules } from '@/hooks/use-compliance';
import { Plus, Trash2, Shield, Loader2 } from 'lucide-react';

const SEVERITY_BADGES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

export function BlacklistManager() {
  const { rules, isLoading, addRule, removeRule } = useComplianceRules();
  const [newTerm, setNewTerm] = useState('');
  const [newSeverity, setNewSeverity] = useState<'info' | 'warning' | 'critical'>('warning');

  const handleAdd = () => {
    if (!newTerm.trim()) return;
    addRule.mutate({ value: newTerm, severity: newSeverity });
    setNewTerm('');
  };

  const userRules = rules.filter((r) => r.source === 'user');
  const defaultRules = rules.filter((r) => r.source === 'meta_default');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Blacklist de Termos
        </CardTitle>
        <CardDescription>
          Termos proibidos nos anuncios. Termos padrao Meta nao podem ser removidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new term */}
        <div className="flex gap-2">
          <Input
            placeholder="Novo termo proibido..."
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <Select value={newSeverity} onValueChange={(v) => setNewSeverity(v as typeof newSeverity)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Alerta</SelectItem>
              <SelectItem value="critical">Critico</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={!newTerm.trim() || addRule.isPending}>
            {addRule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* User rules */}
            {userRules.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Seus termos</h5>
                <div className="flex flex-wrap gap-2">
                  {userRules.map((rule) => (
                    <Badge key={rule.id} variant="outline" className={`${SEVERITY_BADGES[rule.severity] ?? ''} border gap-1 pr-1`}>
                      {rule.value}
                      <button
                        onClick={() => removeRule.mutate(rule.id)}
                        className="ml-1 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Default Meta rules */}
            {defaultRules.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Padrao Meta (nao editavel)</h5>
                <div className="flex flex-wrap gap-2">
                  {defaultRules.map((rule) => (
                    <Badge key={rule.id} variant="outline" className={`${SEVERITY_BADGES[rule.severity] ?? ''} border opacity-70`}>
                      {rule.value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
