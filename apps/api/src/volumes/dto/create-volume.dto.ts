import { z } from 'zod';

export const createVolumeBodySchema = z.object({
  name: z.string().min(1).optional(),
  driver: z.string().min(1).optional(),
  labels: z.record(z.string(), z.string()).optional(),
});

export type CreateVolumeBody = z.infer<typeof createVolumeBodySchema>;
