import { createContext, useContext, useEffect, useState } from 'react';
import * as api from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('collabcode:user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem('collabcode:user', JSON.stringify(user));
    else localStorage.removeItem('collabcode:user');
  }, [user]);

  async function doSignup(form) {
    const result = await api.signup(form);
    setUser(result);
    return result;
  }

  async function doLogin(form) {
    const result = await api.login(form);
    setUser(result);
    return result;
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, signup: doSignup, login: doLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
