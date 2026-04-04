# Meta Ads Domain Knowledge

## Meta Graph API

- **Version**: v22.0
- **Base URL**: `https://graph.facebook.com/v22.0/`
- **Auth**: OAuth 2.0 com tokens de acesso (short-lived → long-lived)

## Hierarquia Meta Ads

```
Business Account
  └── Ad Account (act_XXXXX)
       ├── Campaign (objective: CONVERSIONS, TRAFFIC, etc.)
       │    ├── Ad Set (targeting, budget, schedule)
       │    │    └── Ad (creative + placement)
       │    └── Ad Set ...
       └── Campaign ...
```

## KPIs e Metricas

| Metrica | Campo API | Calculo |
|---------|-----------|---------|
| Impressoes | `impressions` | Direto |
| Cliques | `clicks` | Direto |
| CTR | — | `clicks / impressions * 100` |
| CPC | `cpc` | `spend / clicks` |
| CPA | `cost_per_action_type` | `spend / conversions` |
| ROAS | `purchase_roas` | `receita / spend` |
| Conversoes | `actions[action_type=purchase]` | Via Pixel/CAPI |
| Gasto | `spend` | Direto |

## Endpoints Principais

| Operacao | Endpoint | Method |
|----------|----------|--------|
| Listar campanhas | `act_{ad_account_id}/campaigns` | GET |
| Insights campanha | `{campaign_id}/insights` | GET |
| Listar ad sets | `{campaign_id}/adsets` | GET |
| Listar ads | `{adset_id}/ads` | GET |
| Criativos | `{ad_id}/adcreatives` | GET |
| Ad Account info | `act_{ad_account_id}` | GET |

## Rate Limits

- **Business Use Case**: Rate limit por ad account
- **Batch size recomendado**: 5 requests simultaneos (evitar `Promise.all` com N requests)
- **Backoff**: Exponential backoff em 429/rate limit errors

## OAuth Flow

1. Usuario clica "Conectar Meta" → redirect para `facebook.com/v22.0/dialog/oauth`
2. Scopes necessarios: `ads_read`, `ads_management`, `business_management`
3. Callback recebe `code` → troca por `access_token` (short-lived, ~1h)
4. Troca short-lived por long-lived token (~60 dias)
5. Armazena token em `meta_tokens` table (criptografado)
6. Refresh antes de expirar

## Anti-Patterns Conhecidos

1. **`Promise.all` com muitos items** → Rate limit. Usar batches de 5.
2. **Token hardcoded** → Tokens expiram. Sempre buscar do banco.
3. **Sem paginacao** → API retorna max 25 por default. Usar `after` cursor.
4. **Insights sem date_preset** → Retorna lifetime. Sempre especificar periodo.

---
_Domain knowledge for Meta Ads integration. Update when API version changes._
