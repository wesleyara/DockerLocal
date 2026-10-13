import { z } from 'zod';

export const pruneSystemBodySchema = z.object({
  targets: z
    .array(z.enum(['containers', 'images', 'volumes', 'buildCache']))
    .min(1),
  imagesAll: z.boolean().optional().default(false),
  volumesAll: z.boolean().optional().default(false),
});

export type PruneSystemBody = z.infer<typeof pruneSystemBodySchema>;
