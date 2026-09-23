import { z } from 'zod';

export const volumeFsPathQuerySchema = z.object({
  path: z.string().min(1).default('/'),
});
export type VolumeFsPathQuery = z.infer<typeof volumeFsPathQuerySchema>;

export const volumeFsUploadQuerySchema = z.object({
  path: z.string().min(1),
  overwrite: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  expectedMtime: z.string().optional(),
});
export type VolumeFsUploadQuery = z.infer<typeof volumeFsUploadQuerySchema>;

export const volumeFsMkdirBodySchema = z.object({
  path: z.string().min(1),
});
export type VolumeFsMkdirBody = z.infer<typeof volumeFsMkdirBodySchema>;

export const volumeFsRenameBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type VolumeFsRenameBody = z.infer<typeof volumeFsRenameBodySchema>;
