import { z } from 'zod';

export const nameBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});
export type NameBody = z.infer<typeof nameBodySchema>;

export const enabledBodySchema = z.object({ enabled: z.boolean() });
export type EnabledBody = z.infer<typeof enabledBodySchema>;
