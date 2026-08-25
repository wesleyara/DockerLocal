import { z } from 'zod';

export const removeContainerQuerySchema = z.object({
  force: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  v: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type RemoveContainerQuery = z.infer<typeof removeContainerQuerySchema>;
