import { z } from 'zod';

// Formato de referência de imagem simplificado: nome (com registry/namespace
// opcionais) + tag opcional. Rejeita espaços e caracteres de shell antes de
// o valor virar argumento de `-t` — spawn já usa array/shell:false, isso é
// sobre correção, não injeção.
const REFERENCE_RE =
  /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127})?$/;

const BUILD_ARG_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const buildImageBodySchema = z.object({
  contextPath: z.string().min(1),
  dockerfile: z.string().min(1),
  tags: z
    .array(z.string().regex(REFERENCE_RE, 'Tag de imagem inválida'))
    .min(1),
  buildArgs: z
    .record(z.string().regex(BUILD_ARG_KEY_RE), z.string())
    .optional(),
  noCache: z.boolean().optional(),
  target: z.string().optional(),
  engine: z.enum(['cli', 'api']).optional(),
});

export type BuildImageBody = z.infer<typeof buildImageBodySchema>;
