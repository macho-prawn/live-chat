import { z } from 'zod';

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, 'Nickname must be at least 2 characters.')
  .max(24, 'Nickname must be 24 characters or fewer.')
  .regex(/^[a-zA-Z0-9 _.-]+$/, 'Nickname can only include letters, numbers, spaces, dots, underscores, and dashes.');

export const nicknameColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Nickname color must be a valid hex color.');

export const roomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Room name must be at least 2 characters.')
    .max(40, 'Room name must be 40 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(160, 'Description must be 160 characters or fewer.')
    .optional()
    .transform((value) => value || undefined),
});

export const messageSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty.')
  .max(2000, 'Message must be 2000 characters or fewer.');

export const profileSchema = z.object({
  nickname: nicknameSchema,
  nicknameColor: nicknameColorSchema,
});

export const clientIdSchema = z
  .string()
  .trim()
  .min(6, 'Invalid client session.')
  .max(128, 'Invalid client session.');

export const browserIdSchema = clientIdSchema;

export const tabIdSchema = clientIdSchema;
