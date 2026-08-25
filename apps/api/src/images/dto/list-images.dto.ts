import { z } from 'zod';

export const listImagesQuerySchema = z.object({
  all: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  dangling: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type ListImagesQuery = z.infer<typeof listImagesQuerySchema>;
