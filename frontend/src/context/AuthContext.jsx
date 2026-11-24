import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AUTH_STORAGE_KEY = 'mini_uber_demo_auth_v1';
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
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
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
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
    setAuthModalMode(mode);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalMode(null);
  }, []);

  const login = useCallback(({ email, name, phone }) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const displayName =
      String(name || '').trim() ||
      (cleanEmail ? cleanEmail.split('@')[0] : 'Demo Foodie');

    setUser({
      id: `demo-user-${Date.now()}`,
      name: displayName,
      email: cleanEmail || 'demo@example.edu',
      phone: String(phone || '').trim() || '+91 98765 43210',
      vegOnlyPreference: false,
      emailUpdates: true,
      isDemoAuth: true,
      signedInAt: new Date().toISOString(),
    });
    setAuthModalMode(null);
  }, []);

  const signup = useCallback(({ name, email, phone }) => {
    setUser({
      id: `demo-user-${Date.now()}`,
      name: String(name || '').trim() || 'Demo Foodie',
      email: String(email || '').trim().toLowerCase(),
      phone: String(phone || '').trim() || '+91 98765 43210',
      vegOnlyPreference: false,
      emailUpdates: true,
      isDemoAuth: true,
      signedInAt: new Date().toISOString(),
    });
    setAuthModalMode(null);
  }, []);

  const updateProfile = useCallback((updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
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

