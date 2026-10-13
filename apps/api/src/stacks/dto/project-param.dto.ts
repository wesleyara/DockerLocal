import { z } from 'zod';

// Vira argumento de `docker compose -p` e chave no registry.json — nunca
// deixe passar sem validar, mesmo vindo de um path já "conhecido".
export const projectParamSchema = z.object({
  project: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Nome de projeto inválido'),
});

export type ProjectParam = z.infer<typeof projectParamSchema>;
