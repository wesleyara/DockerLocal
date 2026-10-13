import { z } from 'zod';

// No binário standalone pra Windows (fase 9) não existe socket Unix — o
// Docker Desktop expõe o daemon por named pipe. dockerode trata `socketPath`
// como pipe automaticamente quando o path começa com `\\.\pipe\`.
const DEFAULT_DOCKER_SOCKET =
  process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock';

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5100),
  HOST: z.string().default('127.0.0.1'),
  DOCKER_SOCKET: z.string().default(DEFAULT_DOCKER_SOCKET),
  FS_ROOTS: z.string().default(''),
  AUTH_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173'),
  // Setado só pelo Dockerfile/docker-compose.yml do PRÓPRIO app (fase 9) —
  // nunca configure isso manualmente. Existe porque, dentro de container,
  // o processo PRECISA escutar em 0.0.0.0 pra o `docker run -p` conseguir
  // encaminhar tráfego (publicar porta só funciona pra interfaces do
  // container, nunca pro loopback interno dele). A segurança nesse caso
  // vem de fora: o `ports: ["127.0.0.1:5100:5100"]` do compose garante que
  // só o loopback do HOST alcança essa porta — nunca a LAN.
  DOCKER_LOCAL_CONTAINER: z.coerce.boolean().default(false),
  // Onde ficam os dados persistentes do app (ex.: autostop.json). Padrão:
  // `/data` (volume dockerlocal_data) em container, `~/.dockerlocal` fora.
  DATA_DIR: z.string().optional(),
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

  if (
    env.HOST === '0.0.0.0' &&
    !env.AUTH_TOKEN &&
    !env.DOCKER_LOCAL_CONTAINER
  ) {
    throw new Error(
      'Recusando subir: HOST=0.0.0.0 sem AUTH_TOKEN expõe o daemon do Docker na rede. ' +
        'Defina AUTH_TOKEN ou volte HOST para 127.0.0.1.',
    );
  }

  return env;
}
