import { z } from 'zod';

export const groupLogQuerySchema = z.object({
  ids: z.string().min(1),
  tail: z.coerce.number().int().min(1).max(5000).optional(),
});

export type GroupLogQuery = z.infer<typeof groupLogQuerySchema>;
