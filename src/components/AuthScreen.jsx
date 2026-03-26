import { useState } from 'react';
import { loginWithCredentials, registerUser } from '../api/backend';

/**
 * Экран входа / регистрации до загрузки основного приложения.
 */
export function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setError('');
    setPassword('');
    setPasswordConfirmation('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Укажите email и пароль');
      return;
    }
    setLoading(true);
    try {
      await loginWithCredentials(email, password);
      onLoggedIn();
    } catch (err) {
      setError(err.message || 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) {
      setError('Имя: минимум 2 символа');
      return;
    }
    if (!email.trim()) {
      setError('Укажите email');
      return;
    }
    if (password.length < 6) {
      setError('Пароль: минимум 6 символов');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      await registerUser({
        name,
        email,
        password,
        passwordConfirmation,
      });
      await loginWithCredentials(email, password);
      onLoggedIn();
    } catch (err) {
      setError(err.message || 'Не удалось зарегистрироваться');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center text-white px-4 py-8">
      <div className="w-full max-w-md bg-gray-800/85 border border-gray-700/70 rounded-2xl shadow-2xl backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-700/80 bg-gradient-to-r from-gray-800 to-gray-900">
          <h1 className="text-2xl font-bold text-white text-center">Drones</h1>
          <p className="text-gray-400 text-sm text-center mt-1">
            {mode === 'login' ? 'Вход в систему' : 'Регистрация'}
          </p>
        </div>

        <div className="px-6 py-5">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="block text-sm text-gray-400 mb-1">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-sm text-gray-400 mb-1">
                Пароль
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Вход…' : 'Войти'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-sm text-gray-400 mb-1">
                Имя
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Иван Иванов"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-sm text-gray-400 mb-1">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-sm text-gray-400 mb-1">
                Пароль
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="password"
              />
            </div>
            <div>
              <label htmlFor="reg-password2" className="block text-sm text-gray-400 mb-1">
                Подтверждение пароля
              </label>
              <input
                id="reg-password2"
                type="password"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="repeat password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Регистрация…' : 'Зарегистрироваться'}
            </button>
          </form>
        )}
        </div>

        <div className="px-6 py-4 border-t border-gray-700/80 bg-gray-800/70 text-center text-sm text-gray-400">
          {mode === 'login' ? (
            <>
              Нет аккаунта?{' '}
              <button
                type="button"
                className="text-green-400 hover:text-green-300 font-medium"
                onClick={() => {
                  resetForm();
                  setMode('register');
                }}
              >
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              Уже есть аккаунт?{' '}
              <button
                type="button"
                className="text-green-400 hover:text-green-300 font-medium"
                onClick={() => {
                  resetForm();
                  setName('');
                  setMode('login');
                }}
              >
                Войти
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
