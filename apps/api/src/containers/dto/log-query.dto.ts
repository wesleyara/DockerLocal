import { z } from 'zod';

export const logQuerySchema = z.object({
  tail: z.coerce.number().int().min(1).max(5000).optional(),
});

export type LogQuery = z.infer<typeof logQuerySchema>;
