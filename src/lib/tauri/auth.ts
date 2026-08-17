import { invokeParsed, invokeVoid } from './invoke';
import { LoginInput, sessionSchema, startupSchema } from './types';

export const restoreSession = () => invokeParsed('restore_session', startupSchema);

export const login = (input: LoginInput) => invokeParsed('login', sessionSchema, { input });

export const logout = () => invokeVoid('logout');

export const testConnection = () => invokeVoid('test_connection');
