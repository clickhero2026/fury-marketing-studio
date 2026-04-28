// Helper de navegacao entre views consolidadas (sidebar).
// Permite componentes filhos (cards, toasts) trocar a view raiz
// sem precisar prop-drilling.

export type AppView =
  | 'chat'
  | 'painel'
  | 'criativos'
  | 'cerebro'
  | 'approvals'
  | 'ai-health'
  | 'compliance'
  | 'publisher';

export type CerebroTab = 'regras' | 'memoria' | 'identidade' | 'historico';
export type CerebroRulesSubTab = 'todas' | 'comportamento' | 'acoes' | 'pipeline';
export type CriativosTab = 'ia' | 'meta';
export type PainelTab = 'resumo' | 'analise' | 'orcamento';

interface NavigateOpts {
  cerebroTab?: CerebroTab;
  cerebroRulesSubTab?: CerebroRulesSubTab;
  criativosTab?: CriativosTab;
  painelTab?: PainelTab;
}

const EVENT_NAME = 'app:navigate-view';
const TAB_STORAGE_PREFIX = 'clickhero:tab:';

export function navigateToView(view: AppView, opts: NavigateOpts = {}) {
  // Persiste preferencias de tab pra serem lidas no mount da view destino
  if (opts.cerebroTab) localStorage.setItem(`${TAB_STORAGE_PREFIX}cerebro`, opts.cerebroTab);
  if (opts.cerebroRulesSubTab) localStorage.setItem(`${TAB_STORAGE_PREFIX}cerebro-rules`, opts.cerebroRulesSubTab);
  if (opts.criativosTab) localStorage.setItem(`${TAB_STORAGE_PREFIX}criativos`, opts.criativosTab);
  if (opts.painelTab) localStorage.setItem(`${TAB_STORAGE_PREFIX}painel`, opts.painelTab);

  window.dispatchEvent(new CustomEvent<AppView>(EVENT_NAME, { detail: view }));
}

export function onNavigateToView(handler: (view: AppView) => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<AppView>;
    handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function readTabPref(view: 'cerebro' | 'cerebro-rules' | 'criativos' | 'painel'): string | null {
  try {
    return localStorage.getItem(`${TAB_STORAGE_PREFIX}${view}`);
  } catch {
    return null;
  }
}

export function clearTabPref(view: 'cerebro' | 'cerebro-rules' | 'criativos' | 'painel') {
  try {
    localStorage.removeItem(`${TAB_STORAGE_PREFIX}${view}`);
  } catch { /* ignore */ }
}
