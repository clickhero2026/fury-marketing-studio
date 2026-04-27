// E2E knowledge-base-rag (task 10.5).
// Spec: knowledge-base-rag (R1.4, R5.7, R6.2, R6.3)
//
// Pre-requisitos:
//   - App rodando na baseURL configurada
//   - User de teste com login funcional + briefing minimo
//   - Edge Function kb-ingest deployada e OPENAI_API_KEY no env do Supabase
//   - Pequeno PDF de teste em e2e/fixtures/test.pdf (ou usar um TXT, mais leve)

import { test, expect } from '@playwright/test';
import path from 'path';

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'test+kb@fury.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'CHANGE_ME';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/senha/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/^.*\/$/, { timeout: 10000 });
}

async function goToMemory(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /memoria/i }).click();
  await expect(page.getByRole('heading', { name: 'Memoria' })).toBeVisible();
}

test.describe('Knowledge Base — fluxo principal', () => {
  test('upload de TXT → indexed → busca via chat → citacao clicavel', async ({ page }) => {
    test.slow(); // upload + indexing demora
    await login(page);
    await goToMemory(page);

    // Upload
    await page.getByRole('button', { name: /adicionar/i }).click();
    await expect(page.getByText(/adicionar a memoria/i)).toBeVisible();

    const fixturePath = path.join(__dirname, 'fixtures', 'test.txt');
    await page.locator('input[type="file"]').setInputFiles(fixturePath);
    await page.getByLabel(/titulo/i).fill('Depoimento Maria');
    await page.getByRole('button', { name: /^enviar/i }).click();

    // Aguarda toast de sucesso
    await expect(page.getByText(/documento enviado/i)).toBeVisible();

    // Aguarda processamento — documento deve aparecer na lista com status indexed
    await expect(page.getByText('Depoimento Maria')).toBeVisible();
    // Polling: status pode levar ~30s
    await expect(page.getByText(/indexado/i)).toBeVisible({ timeout: 90_000 });

    // Vai pro chat e pergunta algo que force search_knowledge
    await page.getByRole('button', { name: /assistente ia/i }).click();
    const chatInput = page.getByPlaceholder(/pergunta|mensagem|conversa/i).first();
    await chatInput.fill('Tem algum depoimento na minha memoria?');
    await chatInput.press('Enter');

    // Aguarda resposta com citacao no formato [doc:UUID#chunk:N] OU botao com nome do documento
    await expect(page.getByRole('button', { name: /Depoimento Maria/i })).toBeVisible({ timeout: 30_000 });

    // Click na citacao abre drawer
    await page.getByRole('button', { name: /Depoimento Maria/i }).first().click();
    await expect(page.getByText(/conteudo extraido/i)).toBeVisible();
  });

  test('promocao de anexo do chat — botao "Salvar na memoria"', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /assistente ia/i }).click();

    // Anexa arquivo no chat (assume UI tem botao de anexo)
    test.skip(!process.env.E2E_CHAT_ATTACHMENT_FLOW, 'flow exige fixture + UI de anexo do chat');
    // [...] passos do upload via chat, hover na thumb, click no BookmarkPlus
  });

  test('citacao invalida vira badge "fonte invalida" sem quebrar mensagem', async ({ page }) => {
    // Esse e um teste manual/visual: requer cenario onde IA inventa ref.
    // Skipped por padrao — depende de prompt deliberadamente falho.
    test.skip(true, 'requer cenario controlado de hallucinacao');
  });

  test('quota=blocked impede upload', async ({ page }) => {
    // Requer seed de company com kb_storage_bytes_max=0 ou ja saturado
    test.skip(!process.env.E2E_BLOCKED_USER, 'precisa de user de teste com quota saturada');
    await login(page);
    await goToMemory(page);
    await expect(page.getByText(/quota.*atingida/i)).toBeVisible();
    await page.getByRole('button', { name: /adicionar/i }).click();
    await expect(page.getByRole('button', { name: /^enviar/i })).toBeDisabled();
  });
});
