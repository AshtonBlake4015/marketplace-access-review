import { z } from 'zod';

export const ReviewRequest = z.object({
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assignments: z.array(z.object({
    keyId: z.string().min(1),
    sellerAssets: z.array(z.string().min(1)),
    buyerUpdates: z.boolean(),
    orderHandoff: z.boolean(),
    approvedScopes: z.array(z.string().min(1))
  }).strict()).min(1)
}).strict();
export type ReviewInput = z.infer<typeof ReviewRequest>;

