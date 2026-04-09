import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMetaConnect } from '@/hooks/use-meta-connect';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetaAccountSelector } from '@/components/meta/MetaAccountSelector';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ExternalLink,
  Unplug,
  Settings2,
  RefreshCw,
  Radar,
} from 'lucide-react';
import { useDeepScan } from '@/hooks/use-deep-scan';
import { ScanHealthCard } from '@/components/meta/ScanHealthCard';

const Integrations = () => {
  const {
    integration,
    isLoading,
    isConnected,
    isExpiringSoon,
    isExpired,
    daysUntilExpiry,
    connect,
    disconnect,
    sync,
    isConnecting,
    isDisconnecting,
    isSyncing,
    updateScanInterval,
    isUpdatingScanInterval,
  } = useMetaConnect();
  const { deepScan, isDeepScanning } = useDeepScan();

  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSelector, setShowSelector] = useState(false);

  // Handle OAuth callback — show selector automatically after connect
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const accounts = searchParams.get('accounts');

    if (success === 'true') {
      toast({
        title: 'Meta conectado com sucesso!',
        description: `${accounts || '0'} conta(s) de anuncio encontrada(s). Selecione quais deseja usar.`,
      });
      setSearchParams({});
      setShowSelector(true); // Open selector after OAuth
    } else if (error) {
      toast({
        title: 'Erro na conexao Meta',
        description: decodeURIComponent(error),
        variant: 'destructive',
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, toast]);

  const getStatusBadge = () => {
    if (isConnected) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Conectado
        </Badge>
      );
    }
    if (isExpiringSoon) {
      return (
        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Expira em {daysUntilExpiry} dias
        </Badge>
      );
    }
    if (isExpired) {
      return (
        <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
          <XCircle className="w-3 h-3 mr-1" />
          Expirado
        </Badge>
      );
    }
    return (
      <Badge className="bg-white/5 text-white/50 border-white/10">
        Desconectado
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-[#0c0d0a]">
      {/* Header */}
      <header className="h-14 border-b border-white/[0.06] bg-[#161714]/80 backdrop-blur-xl flex items-center px-6 gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <h1 className="text-sm font-semibold text-white/90">Integracoes</h1>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Meta Ads Card */}
        <Card className="bg-[#161714]/80 border-white/[0.06] backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Meta logo */}
                <div className="w-10 h-10 rounded-xl bg-[#1877F2]/10 flex items-center justify-center">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"
                      fill="#1877F2"
                    />
                  </svg>
                </div>
                <div>
                  <CardTitle className="text-base text-white/90">Meta Ads</CardTitle>
                  <CardDescription className="text-white/40">
                    Conecte suas contas de anuncio do Facebook e Instagram
                  </CardDescription>
                </div>
              </div>
              {getStatusBadge()}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-white/30" />
              </div>
            ) : integration && (isConnected || isExpiringSoon || isExpired) ? (
              <>
                {/* Connected info */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-white/40 block text-xs mb-0.5">Conta Meta</span>
                      <span className="text-white/80">{integration.facebook_user_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-white/40 block text-xs mb-0.5">Ad Account</span>
                      <span className="text-white/80">{integration.account_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-white/40 block text-xs mb-0.5">Business</span>
                      <span className="text-white/80">{integration.business_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-white/40 block text-xs mb-0.5">Expira em</span>
                      <span className="text-white/80">
                        {daysUntilExpiry !== null ? `${daysUntilExpiry} dias` : '—'}
                      </span>
                    </div>
                  </div>

                  {integration.last_sync && (
                    <p className="text-xs text-white/30">
                      Ultima sincronizacao:{' '}
                      {new Date(integration.last_sync).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                {/* Warning for expiring/expired */}
                {isExpiringSoon && (
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-200/80">
                      Seu token expira em {daysUntilExpiry} dias. Reconecte para renovar.
                    </p>
                  </div>
                )}

                {isExpired && (
                  <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-200/80">
                      Token expirado. Reconecte sua conta Meta para continuar usando.
                    </p>
                  </div>
                )}

                {/* Scan health card */}
                <ScanHealthCard />

                {/* Scan interval */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-sm text-white/70">
                    Intervalo de varredura automatica
                  </div>
                  <Select
                    value={String(integration?.scan_interval_hours ?? 24)}
                    onValueChange={(v) => updateScanInterval(Number(v))}
                    disabled={isUpdatingScanInterval || !isConnected}
                  >
                    <SelectTrigger className="w-[160px] bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">A cada 6 horas</SelectItem>
                      <SelectItem value="12">A cada 12 horas</SelectItem>
                      <SelectItem value="24">A cada 24 horas</SelectItem>
                      <SelectItem value="48">A cada 48 horas</SelectItem>
                      <SelectItem value="72">A cada 72 horas</SelectItem>
                      <SelectItem value="168">Semanal (168h)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowSelector(!showSelector)}
                    variant="outline"
                    className="flex-1 bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    {showSelector ? 'Fechar Ativos' : 'Gerenciar Ativos'}
                  </Button>
                  <Button
                    onClick={sync}
                    disabled={isSyncing || !isConnected}
                    className="flex-1 brand-gradient text-white hover:opacity-90"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                  </Button>
                  <Button
                    onClick={deepScan}
                    disabled={isDeepScanning || !isConnected}
                    variant="outline"
                    className="flex-1 bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    {isDeepScanning ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Radar className="w-4 h-4 mr-2" />
                    )}
                    {isDeepScanning ? 'Varrendo...' : 'Varredura Profunda'}
                  </Button>
                  {(isExpiringSoon || isExpired) && (
                    <Button
                      onClick={connect}
                      disabled={isConnecting}
                      className="flex-1 brand-gradient text-white hover:opacity-90"
                    >
                      {isConnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Reconectar
                    </Button>
                  )}
                  <Button
                    onClick={disconnect}
                    disabled={isDisconnecting}
                    variant="outline"
                    className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    {isDisconnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Unplug className="w-4 h-4 mr-2" />
                    Desconectar
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Not connected */}
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-6 text-center space-y-3">
                  <p className="text-sm text-white/50">
                    Conecte sua conta Meta Ads para importar campanhas, metricas e insights
                    automaticamente.
                  </p>
                  <ul className="text-xs text-white/30 space-y-1">
                    <li>Leitura e gestao de campanhas</li>
                    <li>Metricas e insights em tempo real</li>
                    <li>Acesso ao Business Manager</li>
                    <li>Analise de criativos</li>
                  </ul>
                </div>

                <Button
                  onClick={connect}
                  disabled={isConnecting}
                  className="w-full h-11 brand-gradient text-white font-medium rounded-xl hover:opacity-90 transition-all"
                >
                  {isConnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Conectar Meta Ads
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Asset Selector — shown after connect or when managing */}
        {showSelector && (
          <Card className="bg-[#161714]/80 border-white/[0.06] backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-base text-white/90">Selecionar Ativos</CardTitle>
              <CardDescription className="text-white/40">
                Escolha quais contas de anuncio e paginas deseja gerenciar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetaAccountSelector onComplete={() => setShowSelector(false)} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Integrations;
