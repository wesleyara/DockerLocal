import { z } from 'zod';

export const stopContainerBodySchema = z.object({
  t: z.coerce.number().int().positive().optional(),
});
export type StopContainerBody = z.infer<typeof stopContainerBodySchema>;

export const restartContainerBodySchema = z.object({
  t: z.coerce.number().int().positive().optional(),
});
export type RestartContainerBody = z.infer<typeof restartContainerBodySchema>;

export const killContainerBodySchema = z.object({
  signal: z.string().default('SIGTERM'),
});
export type KillContainerBody = z.infer<typeof killContainerBodySchema>;

export const renameContainerBodySchema = z.object({
  name: z.string().min(1),
});
export type RenameContainerBody = z.infer<typeof renameContainerBodySchema>;
