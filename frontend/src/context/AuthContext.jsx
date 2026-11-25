import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const AUTH_STORAGE_KEY = 'mini_uber_demo_auth_v1';
const ACCOUNTS_STORAGE_KEY = 'mini_uber_demo_accounts_v1';
const ADDRESSES_STORAGE_KEY = 'mini_uber_saved_addresses_v1';

const DEFAULT_SAVED_ADDRESSES = [
  {
    id: 'addr-home',
    label: 'Home',
    flat: 'Flat 4B, Maple Heights',
    street: '100 Feet Road, Indiranagar',
    landmark: 'Near Indiranagar Metro Station',
    city: 'Bengaluru',
    pincode: '560038',
    lat: 12.9855,
    lng: 77.6412,
    isDefault: true,
  },
  {
    id: 'addr-work',
    label: 'Work',
    flat: 'Floor 6, Horizon Tech Park',
    street: 'MG Road, Shanthala Nagar',
    landmark: 'Opposite Trinity Circle',
    city: 'Bengaluru',
    pincode: '560001',
    lat: 12.9746,
    lng: 77.6194,
    isDefault: false,
  },
];

const AuthContext = createContext(null);

function generateSalt() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

async function hashDemoPassword(password, salt) {
  const input = `${salt}:${String(password || '')}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic non-plaintext fallback for restricted non-secure contexts
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function readStoredAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeStoredAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore storage errors
  }
}

function buildPublicUser(account) {
  if (!account) return null;
  const resolvedName = String(account.name || '').trim() || 'Demo Foodie';
  return {
    id: account.id,
    name: resolvedName,
    full_name: resolvedName,
    email: account.email,
    phone: String(account.phone || '').trim(),
    vegOnlyPreference: Boolean(account.vegOnlyPreference),
    emailUpdates: account.emailUpdates !== false,
    isDemoAuth: true,
    created_at: account.createdAt || account.signedInAt || new Date().toISOString(),
    signedInAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Strip any password fields defensively if old state ever had them
          const { password: _pw, passwordHash: _ph, passwordSalt: _ps, ...safeUser } = parsed;
          return safeUser;
        }
      }
    } catch {
      // ignore storage errors
    }
    return null;
  });

  const [savedAddresses, setSavedAddresses] = useState(() => {
    try {
      const raw = localStorage.getItem(ADDRESSES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SAVED_ADDRESSES;
  });

  const [authModalMode, setAuthModalMode] = useState(null);

  useEffect(() => {
    try {
      if (user) {
        const { password: _pw, passwordHash: _ph, passwordSalt: _ps, ...safeUser } = user;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [user]);

  useEffect(() => {
    try {
      localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(savedAddresses));
    } catch {
      // ignore storage errors
    }
  }, [savedAddresses]);

  const openAuthModal = useCallback((mode = 'login') => {
    setAuthModalMode(mode === 'signup' ? 'signup' : 'login');
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalMode(null);
  }, []);

  const signup = useCallback(async ({ fullName, name, email, phone, password }) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(fullName ?? name ?? '').trim() || 'Demo Foodie';
    const cleanPhone = String(phone || '').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (!password || String(password).length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters long.' };
    }

    const accounts = readStoredAccounts();
    if (accounts.some((acc) => acc.email === cleanEmail)) {
      return {
        ok: false,
        error: 'A local demo account with this email already exists. Please log in instead.',
      };
    }

    const passwordSalt = generateSalt();
    const passwordHash = await hashDemoPassword(password, passwordSalt);
    const createdAt = new Date().toISOString();

    const newAccount = {
      id: `demo-user-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      passwordSalt,
      passwordHash,
      createdAt,
    };

    writeStoredAccounts([newAccount, ...accounts]);
    const publicUser = buildPublicUser(newAccount);
    setUser(publicUser);
    setAuthModalMode(null);

    return { ok: true, user: publicUser };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (!password || String(password).length < 6) {
      return { ok: false, error: 'Please enter your password (at least 6 characters).' };
    }

    const accounts = readStoredAccounts();
    const account = accounts.find((acc) => acc.email === cleanEmail);
    if (!account) {
      return {
        ok: false,
        error: 'No local demo account found for this email in this browser. Create a demo account first.',
      };
    }

    const candidateHash = await hashDemoPassword(password, account.passwordSalt);
    if (candidateHash !== account.passwordHash) {
      return {
        ok: false,
        error: 'Incorrect password for this local demo account.',
      };
    }

    const publicUser = buildPublicUser(account);
    setUser(publicUser);
    setAuthModalMode(null);

    return { ok: true, user: publicUser };
  }, []);

  const updateProfile = useCallback(async ({ full_name, name, phone, ...rest }) => {
    if (!user) {
      return { ok: false, error: 'Sign in with a local demo account first.' };
    }

    const updatedName = String(full_name ?? name ?? user.name ?? '').trim() || user.name;
    const updatedPhone = phone !== undefined ? String(phone).trim() : user.phone;

    const updatedUser = {
      ...user,
      ...rest,
      name: updatedName,
      full_name: updatedName,
      phone: updatedPhone,
      updated_at: new Date().toISOString(),
    };

    const accounts = readStoredAccounts();
    const nextAccounts = accounts.map((acc) =>
      acc.email === user.email || acc.id === user.id
        ? { ...acc, name: updatedName, phone: updatedPhone }
        : acc
    );
    writeStoredAccounts(nextAccounts);
    setUser(updatedUser);

    return { ok: true, user: updatedUser };
  }, [user]);

  const logout = useCallback(async () => {
    setUser(null);
    return { ok: true };
  }, []);

  const addAddress = useCallback((addressObj) => {
    const created = {
      id: `addr-${Date.now()}`,
      label: addressObj.label || 'Other',
      flat: addressObj.flat || '',
      street: addressObj.street || '',
      landmark: addressObj.landmark || '',
      city: addressObj.city || 'Bengaluru',
      pincode: addressObj.pincode || '',
      lat: Number(addressObj.lat) || 12.9855,
      lng: Number(addressObj.lng) || 77.6412,
      isDefault: Boolean(addressObj.isDefault),
    };
    setSavedAddresses((prev) => {
      const normalized = created.isDefault
        ? prev.map((a) => ({ ...a, isDefault: false }))
        : prev;
      return [created, ...normalized];
    });
    return created;
  }, []);

  const deleteAddress = useCallback((id) => {
    setSavedAddresses((prev) => {
      const filtered = prev.filter((a) => a.id !== id);
      if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
        filtered[0] = { ...filtered[0], isDefault: true };
      }
      return filtered;
    });
  }, []);

  const setDefaultAddress = useCallback((id) => {
    setSavedAddresses((prev) =>
      prev.map((a) => ({ ...a, isDefault: a.id === id }))
    );
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading: false,
        isAuthenticated: Boolean(user),
        isDemoAuth: true,
        savedAddresses,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        login,
        signup,
        updateProfile,
        logout,
        addAddress,
        deleteAddress,
        setDefaultAddress,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
