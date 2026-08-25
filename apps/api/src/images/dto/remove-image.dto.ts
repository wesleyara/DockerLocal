import { z } from 'zod';

export const removeImageQuerySchema = z.object({
  force: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  noprune: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type RemoveImageQuery = z.infer<typeof removeImageQuerySchema>;
