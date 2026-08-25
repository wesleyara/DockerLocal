import { z } from 'zod';

export const pruneImagesBodySchema = z.object({
  danglingOnly: z.boolean().optional().default(true),
});

export type PruneImagesBody = z.infer<typeof pruneImagesBodySchema>;
