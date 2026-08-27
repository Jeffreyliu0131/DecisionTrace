import { z } from "zod";

import {
  reviewDecisionSchema,
  semanticReviewDecisionSchema,
} from "../schemas/index.js";

export const reportKeySchema = z.string().regex(/^RPT-[a-f0-9]{12}$/u);

export const findingReviewRequestSchema = z
  .object({
    reportKey: reportKeySchema,
    findingId: z.string().regex(/^FND-[a-f0-9]{12}$/u),
    decision: reviewDecisionSchema,
    reason: z.string().trim().min(1).max(2000),
    reviewer: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const semanticReviewRequestSchema = z
  .object({
    reportKey: reportKeySchema,
    candidateId: z.string().regex(/^SEM-[a-f0-9]{12}$/u),
    decision: semanticReviewDecisionSchema,
    reason: z.string().trim().min(1).max(2000),
    reviewer: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type FindingReviewRequest = z.infer<typeof findingReviewRequestSchema>;
export type SemanticReviewRequest = z.infer<typeof semanticReviewRequestSchema>;
