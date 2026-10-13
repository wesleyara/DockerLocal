import { z } from 'zod';

export const listContainersQuerySchema = z.object({
  all: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  project: z.string().optional(),
  status: z.string().optional(),
});

export type ListContainersQuery = z.infer<typeof listContainersQuerySchema>;
