import { FormEvent, useState } from 'react';

import { login } from '../../lib/tauri/auth';
import { AppError, Profile } from '../../lib/tauri/types';

interface LoginScreenProps {
  savedProfile: Profile | null;
  initialError?: AppError | null;
  loginAction?: typeof login;
  onConnected: Awaited<ReturnType<typeof login>> extends infer Session
    ? (session: Session) => void
    : never;
}

interface Fields {
  serverUrl: string;
  username: string;
  password: string;
  rememberCredential: boolean;
}

export function LoginScreen({
  savedProfile,
  initialError,
  onConnected,
  loginAction = login,
}: LoginScreenProps) {
  const [fields, setFields] = useState<Fields>({
    serverUrl: savedProfile?.serverUrl ?? '',
    username: savedProfile?.username ?? '',
    password: '',
    rememberCredential: savedProfile?.rememberCredential ?? true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    initialError ? { code: initialError.code, message: initialError.message } : null,
  );
  const [confirmPrivateHttp, setConfirmPrivateHttp] = useState(false);

  const connect = async (allowPrivateHttp: boolean) => {
    if (!fields.serverUrl.trim() || !fields.username.trim() || !fields.password) {
      setError({
        code: 'REQUIRED_FIELDS',
        message: 'Enter the server URL, username, and password.',
      });
      return;
    }
    setBusy(true);
    setError(null);
    let clearPassword = true;
    try {
      const session = await loginAction({ ...fields, allowPrivateHttp });
      onConnected(session);
    } catch (cause) {
      const appError = cause as AppError;
      if (appError.code === 'PRIVATE_HTTP_CONFIRMATION_REQUIRED') {
        setConfirmPrivateHttp(true);
        clearPassword = false;
      } else {
        setError({ code: appError.code, message: appError.message });
      }
    } finally {
      if (clearPassword) setFields((current) => ({ ...current, password: '' }));
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void connect(false);
  };

  return (
    <main className="login-layout">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          ♪
        </div>
        <p className="eyebrow">Pocket Player</p>
        <h1 id="login-title">A Navidrome Revolution</h1>
        <h2>Connect to Navidrome</h2>
        <p className="muted">
          Credentials stay in the Windows app and are never sent to this webview after login.
        </p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="server-url">Server URL</label>
          <input
            id="server-url"
            name="serverUrl"
            type="url"
            autoComplete="url"
            placeholder="https://music.example.com"
            value={fields.serverUrl}
            disabled={busy}
            onChange={(event) => setFields({ ...fields, serverUrl: event.target.value })}
          />

          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={fields.username}
            disabled={busy}
            onChange={(event) => setFields({ ...fields, username: event.target.value })}
          />

          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={fields.password}
              disabled={busy}
              onChange={(event) => setFields({ ...fields, password: event.target.value })}
            />
            <button
              className="text-button"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={fields.rememberCredential}
              disabled={busy}
              onChange={(event) =>
                setFields({ ...fields, rememberCredential: event.target.checked })
              }
            />
            Remember login in Windows Credential Manager
          </label>

          {error && (
            <div className="message error-message" role="alert">
              <strong>Couldn’t connect</strong>
              <span>{error.message}</span>
            </div>
          )}

          <button className="primary-button full-width" type="submit" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        {confirmPrivateHttp && (
          <div className="confirmation" role="alertdialog" aria-labelledby="http-warning-title">
            <h2 id="http-warning-title">Use unencrypted LAN connection?</h2>
            <p>
              HTTP does not protect your password or music traffic. Continue only if this address is
              on a private network you trust.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setConfirmPrivateHttp(false);
                  setFields((current) => ({ ...current, password: '' }));
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  setConfirmPrivateHttp(false);
                  void connect(true);
                }}
              >
                Accept private HTTP
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
