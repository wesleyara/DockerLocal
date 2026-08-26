import { z } from 'zod';

export const addFsRootBodySchema = z.object({
  path: z.string().min(1),
});

export type AddFsRootBody = z.infer<typeof addFsRootBodySchema>;
