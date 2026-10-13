import { z } from 'zod';

export const composeDownBodySchema = z.object({
  volumes: z.boolean().optional(),
  rmi: z.enum(['local', 'all']).optional(),
});

export type ComposeDownBody = z.infer<typeof composeDownBodySchema>;
