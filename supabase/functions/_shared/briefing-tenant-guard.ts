// Reexport do tenant-guard generico para compatibilidade retroativa.
// Novos usos devem importar `requireTenant` de `./tenant-guard.ts` direto.
// Spec: knowledge-base-rag (task 9.1)

export {
  requireTenant as requireBriefingTenant,
  requireTenant,
  type TenantGuardOk,
  type TenantGuardFail,
  type TenantGuardResult,
} from './tenant-guard.ts';
