import { z } from 'zod';

export const createStackBodySchema = z.object({
  composeFilePath: z.string().min(1),
  projectName: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Nome de projeto inválido')
    .optional(),
  envFile: z.string().min(1).optional(),
  up: z.boolean().optional(),
});

export type CreateStackBody = z.infer<typeof createStackBodySchema>;
