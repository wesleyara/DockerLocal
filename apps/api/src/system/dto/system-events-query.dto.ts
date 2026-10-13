import { z } from 'zod';

export const systemEventsQuerySchema = z.object({
  types: z.string().optional(),
});

export type SystemEventsQuery = z.infer<typeof systemEventsQuerySchema>;
