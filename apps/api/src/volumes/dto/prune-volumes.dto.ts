import { z } from 'zod';

export const pruneVolumesBodySchema = z.object({
  all: z.boolean().optional().default(false),
});

export type PruneVolumesBody = z.infer<typeof pruneVolumesBodySchema>;
