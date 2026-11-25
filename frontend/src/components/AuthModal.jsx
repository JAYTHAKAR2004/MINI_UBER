import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import BrandLogo from './BrandLogo';

export default function AuthModal() {
  const { authModalMode, closeAuthModal, openAuthModal, login, signup } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);

  useEffect(() => {
    submitLockRef.current = false;
    setError('');
    setSubmitting(false);
    setPassword('');
  }, [authModalMode]);

  if (!authModalMode) return null;

  const isSignup = authModalMode === 'signup';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current || submitting) {
      return;
    }

    setError('');

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (isSignup && name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (password.length < 6) {
      setError('Enter a demo password (at least 6 characters).');
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      if (isSignup) {
        const res = await signup({
          fullName: name.trim(),
          email,
          phone,
          password,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        showToast({
          title: `Welcome, ${res.user?.name || name.trim()}!`,
          description: 'Signed in with local browser demo authentication.',
          type: 'success',
        });
        return;
      }

      const res = await login({ email, password });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      showToast({
        title: `Welcome back, ${res.user?.name || email.trim()}!`,
        description: 'Signed in to your local demo account.',
        type: 'success',
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-elevated sm:p-7">
        <div className="flex items-center justify-between">
          <BrandLogo size="sm" />
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close authentication modal"
            className="rounded-full p-1.5 text-neutral-500 hover:bg-surface-soft hover:text-brand-black"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2
          id="auth-modal-title"
          className="mt-5 font-display text-2xl font-extrabold text-brand-black"
        >
          {isSignup ? 'Sign up (Demo)' : 'Log in (Demo)'}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {isSignup
            ? 'Create a local demo profile to manage saved addresses and orders.'
            : 'Access your local saved delivery addresses and order history.'}
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Demo Authentication Only:</strong> Stored locally in your browser (with salted SHA-256 hashing; never plaintext) and kept separate from the backend order database. No email verification or production auth server is connected.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {isSignup && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700">
                Full Name *
              </label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aarav Mehta"
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700">
              Email Address *
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
            />
          </div>

          {isSignup && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700">
                Mobile Number
              </label>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700">
              Demo Password *
            </label>
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 text-sm font-bold text-white shadow-soft transition-colors hover:bg-brand-primaryDark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignup
              ? submitting
                ? 'Creating Demo Account...'
                : 'Create Demo Account'
              : submitting
              ? 'Signing in...'
              : 'Continue to Zomato Demo'}
          </button>
        </form>

        <div className="mt-5 border-t border-neutral-100 pt-4 text-center text-xs text-neutral-600">
          {isSignup ? (
            <>
              Already have a demo account?{' '}
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="font-bold text-brand-primary hover:underline"
              >
                Log in
              </button>
            </>
          ) : (
            <>
              New to Zomato?{' '}
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="font-bold text-brand-primary hover:underline"
              >
                Create demo account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
