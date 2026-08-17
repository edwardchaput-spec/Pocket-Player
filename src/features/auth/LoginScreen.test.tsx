import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../lib/tauri/types';
import { sessionFixture } from '../../test/fixtures';
import { LoginScreen } from './LoginScreen';

describe('LoginScreen', () => {
  it('requires all connection fields', () => {
    const loginAction = vi.fn();
    render(<LoginScreen savedProfile={null} onConnected={vi.fn()} loginAction={loginAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter the server URL, username, and password.',
    );
    expect(loginAction).not.toHaveBeenCalled();
  });

  it('clears the password after successful login', async () => {
    const loginAction = vi.fn(() => Promise.resolve(sessionFixture));
    const connected = vi.fn();
    render(<LoginScreen savedProfile={null} onConnected={connected} loginAction={loginAction} />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(connected).toHaveBeenCalledWith(sessionFixture));
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('shows typed invalid credentials and clears the password', async () => {
    const loginAction = async () => {
      await Promise.resolve();
      throw new AppError({
        code: 'INVALID_CREDENTIALS',
        message: 'The username or password is incorrect.',
        retryable: false,
      });
    };
    render(<LoginScreen savedProfile={null} onConnected={vi.fn()} loginAction={loginAction} />);
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The username or password is incorrect.',
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('requires separate private HTTP confirmation before submitting credentials', async () => {
    let attempt = 0;
    const loginAction = async () => {
      attempt += 1;
      await Promise.resolve();
      if (attempt === 1) {
        throw new AppError({
          code: 'PRIVATE_HTTP_CONFIRMATION_REQUIRED',
          message: 'Confirm private HTTP.',
          retryable: false,
        });
      }
      return sessionFixture;
    };
    const connected = vi.fn();
    render(<LoginScreen savedProfile={null} onConnected={connected} loginAction={loginAction} />);
    await userEvent.type(screen.getByLabelText('Server URL'), 'http://10.123.45.67:4533');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'temporary-password');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('temporary-password');
    fireEvent.click(screen.getByRole('button', { name: 'Accept private HTTP' }));
    await waitFor(() => expect(connected).toHaveBeenCalledWith(sessionFixture));
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});

async function fillForm() {
  await userEvent.type(screen.getByLabelText('Server URL'), 'https://music.example.test');
  await userEvent.type(screen.getByLabelText('Username'), 'alice');
  await userEvent.type(screen.getByLabelText('Password'), 'temporary-password');
}
