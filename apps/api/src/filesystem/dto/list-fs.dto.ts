import { z } from 'zod';

export const listFsQuerySchema = z.object({
  path: z.string().min(1),
  showHidden: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type ListFsQuery = z.infer<typeof listFsQuerySchema>;
