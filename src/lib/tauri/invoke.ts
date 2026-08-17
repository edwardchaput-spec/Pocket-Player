import { invoke } from '@tauri-apps/api/core';
import { ZodType } from 'zod';

import { AppError, appErrorSchema } from './types';

export async function invokeParsed<T>(
  command: string,
  schema: ZodType<T>,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    const value = await invoke<unknown>(command, args);
    return schema.parse(value);
  } catch (cause) {
    throw normalizeAppError(cause);
  }
}

export async function invokeVoid(command: string, args?: Record<string, unknown>): Promise<void> {
  try {
    await invoke(command, args);
  } catch (cause) {
    throw normalizeAppError(cause);
  }
}

export function normalizeAppError(cause: unknown): AppError {
  const parsed = appErrorSchema.safeParse(cause);
  if (parsed.success) return parsed.data;
  return new AppError({
    code: 'UNEXPECTED_ERROR',
    message: 'Something unexpected went wrong. Please try again.',
    retryable: true,
  });
}
