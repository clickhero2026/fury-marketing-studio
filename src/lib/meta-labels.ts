// Mapeamentos de enums Meta Graph API para pt-BR.
// Centralizado para reuso entre DashboardView, CreativesView, futuros componentes.

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  DELETED: "Deletado",
  ARCHIVED: "Arquivado",
  PREAPPROVED: "Pre-aprovado",
  PENDING_REVIEW: "Em revisao",
  IN_PROCESS: "Em processo",
  DISAPPROVED: "Rejeitado",
  WITH_ISSUES: "Com problemas",
  PENDING_BILLING_INFO: "Pagamento pendente",
  CAMPAIGN_PAUSED: "Campanha pausada",
  ADSET_PAUSED: "Conjunto pausado",
};

export const OBJECTIVE_LABELS: Record<string, string> = {
  // ODAX (novos)
  OUTCOME_SALES: "Vendas",
  OUTCOME_TRAFFIC: "Trafego",
  OUTCOME_LEADS: "Leads",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_APP_PROMOTION: "Promocao de app",
  // Legacy
  CONVERSIONS: "Conversoes",
  LINK_CLICKS: "Cliques",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento",
  LEAD_GENERATION: "Leads",
  MESSAGES: "Mensagens",
  VIDEO_VIEWS: "Visualizacoes",
  POST_ENGAGEMENT: "Engajamento",
  PAGE_LIKES: "Curtidas da pagina",
  APP_INSTALLS: "Instalacoes",
  PRODUCT_CATALOG_SALES: "Vendas do catalogo",
  STORE_VISITS: "Visitas a loja",
};

export const humanizeStatus = (s: string | null | undefined): string =>
  s ? (STATUS_LABELS[s] ?? s) : "—";

export const humanizeObjective = (o: string | null | undefined): string =>
  o ? (OBJECTIVE_LABELS[o] ?? o) : "—";

// Formata numeros grandes: 1.500.000 -> "1.5M", 2.500 -> "2.5K", 42 -> "42"
export const fmtCompact = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("pt-BR");
};

export const fmtBRL = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
