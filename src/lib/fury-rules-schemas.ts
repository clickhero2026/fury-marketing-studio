// Zod schemas para fury-learning.
// Spec: .kiro/specs/fury-learning/ (T3.2)

import { z } from 'zod';

const ScopeSchema = z.object({
  level: z.enum(['global', 'campaign', 'adset', 'creative', 'ad_account']),
  id: z.string().optional(),
});

export const ProposedRuleSchema = z
  .object({
    rule_type: z.enum(['behavior', 'action', 'creative_pipeline']),
    confidence: z.number().min(0).max(1),
    name: z.string().min(1).max(60),
    description: z.string().min(1).max(1000),
    scope: ScopeSchema,
    reasoning: z.string().min(1).max(200),
    trigger: z
      .object({
        metric: z.string().optional(),
        operator: z.enum(['>', '>=', '<', '<=', '==']).optional(),
        value: z.number().optional(),
        window_days: z.number().int().min(1).max(90).optional(),
        consecutive_days: z.number().int().min(1).max(30).optional(),
      })
      .optional(),
    action: z
      .object({
        type: z.enum(['pause', 'alert', 'suggest']).optional(),
        params: z.record(z.unknown()).optional(),
      })
      .optional(),
    transform: z
      .object({
        transform_type: z
          .enum(['logo_overlay', 'caption', 'cta_text', 'font', 'color_filter', 'watermark', 'crop', 'custom'])
          .optional(),
        params: z.record(z.unknown()).optional(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.rule_type === 'action' && (!val.trigger || !val.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Acao automatica exige trigger e action',
        path: ['rule_type'],
      });
    }
    if (val.rule_type === 'creative_pipeline' && (!val.transform || !val.transform.transform_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pipeline exige transform.transform_type',
        path: ['rule_type'],
      });
    }
  });

export type ProposedRuleParsed = z.infer<typeof ProposedRuleSchema>;

export const RuleEditFormSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(1000),
  scope: ScopeSchema,
});
export type RuleEditForm = z.infer<typeof RuleEditFormSchema>;
