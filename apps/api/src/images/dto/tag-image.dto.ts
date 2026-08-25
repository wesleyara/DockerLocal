import { z } from 'zod';

export const tagImageBodySchema = z.object({
  repo: z.string().min(1),
  tag: z.string().min(1).optional(),
});

export type TagImageBody = z.infer<typeof tagImageBodySchema>;
