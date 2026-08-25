import { z } from 'zod';

export const removeVolumeQuerySchema = z.object({
  force: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type RemoveVolumeQuery = z.infer<typeof removeVolumeQuerySchema>;
