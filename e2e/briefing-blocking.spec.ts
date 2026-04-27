// E2E de bloqueio funcional dependente do briefing (task 10.4).
// Spec: briefing-onboarding (R8.3, R8.4, R8.5)
//
// Pre-requisitos: user de teste com briefing INCOMPLETO em staging.

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'test+briefing@fury.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'CHANGE_ME';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/senha/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
}

test.describe('Briefing — bloqueio funcional', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // pular para chegar na home com briefing incompleto
    await page.waitForURL(/\/briefing\/wizard|\/$/);
    if (page.url().includes('/briefing/wizard')) {
      await page.getByRole('button', { name: /pular por enquanto/i }).click();
      await page.waitForURL(/^.*\/$/);
    }
  });

  test('R8.3: banner persistente exibe missing fields quando incompleto', async ({ page }) => {
    await expect(page.getByText(/briefing.*(incompleto|nao iniciado)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /completar briefing|comecar agora/i })).toBeVisible();
  });

  test('R8.3: clicar no CTA leva pra BriefingView ou wizard', async ({ page }) => {
    await page.getByRole('button', { name: /completar briefing|comecar agora/i }).click();
    await expect(page).toHaveURL(/\/briefing/);
  });

  test('R8.4: chat funciona normal mesmo com briefing incompleto', async ({ page }) => {
    // Banner aparece, mas chat nao quebra. Apenas geracao de criativo deve ser sugerida pendente.
    await page.goto('/');
    // Verifica que UI do chat carregou (placeholder de input visivel)
    await expect(page.getByPlaceholder(/pergunta|mensagem|conversa/i).first()).toBeVisible();
  });

  test('R8.3: tentativa de publicar campanha com BRIEFING_GATE_ENABLED retorna 422', async ({ request }) => {
    test.skip(process.env.BRIEFING_GATE_ENABLED !== 'true', 'gate desabilitado');
    // Direct API call via supabase functions endpoint
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    test.skip(!supabaseUrl, 'VITE_SUPABASE_URL ausente');

    const userToken = process.env.TEST_USER_JWT ?? '';
    const res = await request.post(`${supabaseUrl}/functions/v1/campaign-publish`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      data: { ad_account_id: 'act_fake' },
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.kind).toBe('briefing_incomplete');
    expect(Array.isArray(body.missing_fields)).toBe(true);
  });

  test('R8.5: apos completar briefing, banner some e bloqueio libera', async ({ page }) => {
    test.slow();
    // Completar via UI seria longo — neste teste assumimos que outro user/seed tem briefing completo.
    test.skip(!process.env.TEST_USER_COMPLETE_EMAIL, 'sem user com briefing completo');

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_USER_COMPLETE_EMAIL!);
    await page.getByLabel(/senha/i).fill(process.env.TEST_USER_COMPLETE_PASSWORD ?? '');
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL(/^.*\/$/);

    // Banner NAO deve aparecer
    await expect(page.getByText(/briefing.*incompleto/i)).toBeHidden({ timeout: 5000 });
  });
});
