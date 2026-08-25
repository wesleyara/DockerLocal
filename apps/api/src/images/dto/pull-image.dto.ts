import { z } from 'zod';

export const pullImageBodySchema = z.object({
  ref: z.string().min(1),
});

export type PullImageBody = z.infer<typeof pullImageBodySchema>;
