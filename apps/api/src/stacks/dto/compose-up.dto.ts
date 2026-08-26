import { z } from 'zod';

export const composeUpBodySchema = z.object({
  services: z.array(z.string()).optional(),
  build: z.boolean().optional(),
  forceRecreate: z.boolean().optional(),
  pull: z.enum(['always', 'missing', 'never']).optional(),
});

export type ComposeUpBody = z.infer<typeof composeUpBodySchema>;

export const composeBuildBodySchema = z.object({
  services: z.array(z.string()).optional(),
  noCache: z.boolean().optional(),
});

export type ComposeBuildBody = z.infer<typeof composeBuildBodySchema>;

export const composeServicesBodySchema = z.object({
  services: z.array(z.string()).optional(),
});

export type ComposeServicesBody = z.infer<typeof composeServicesBodySchema>;
