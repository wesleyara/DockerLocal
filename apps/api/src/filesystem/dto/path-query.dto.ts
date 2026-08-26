import { z } from 'zod';

export const pathQuerySchema = z.object({
  path: z.string().min(1),
});

export type PathQuery = z.infer<typeof pathQuerySchema>;
