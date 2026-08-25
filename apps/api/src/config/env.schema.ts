import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5100),
  HOST: z.string().default('127.0.0.1'),
  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  FS_ROOTS: z.string().default(''),
  AUTH_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }

  const env = parsed.data;

  if (env.HOST === '0.0.0.0' && !env.AUTH_TOKEN) {
    throw new Error(
      'Recusando subir: HOST=0.0.0.0 sem AUTH_TOKEN expõe o daemon do Docker na rede. ' +
        'Defina AUTH_TOKEN ou volte HOST para 127.0.0.1.',
    );
  }

  return env;
}
