import { z } from 'zod';

import { invokeParsed, invokeVoid } from './invoke';
import { LoginInput, sessionSchema, startupSchema } from './types';

export const restoreSession = () => invokeParsed('restore_session', startupSchema);

export const platformInfoSchema = z.object({
  platform: z.string(),
  persistentCredentials: z.boolean(),
});
export type PlatformInfo = z.infer<typeof platformInfoSchema>;

export const getPlatformInfo = () => invokeParsed('platform_info', platformInfoSchema);

export const login = (input: LoginInput) => invokeParsed('login', sessionSchema, { input });

export const logout = () => invokeVoid('logout');

export const testConnection = () => invokeVoid('test_connection');
