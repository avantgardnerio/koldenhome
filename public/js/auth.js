import { useState, useEffect } from "preact/hooks";

export function useAuth() {
  const [state, setState] = useState({ authenticated: false, local: false, user: null, loading: true, pending: false, googleConfigured: false });

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setState({
        authenticated: data.authenticated,
        local: data.local || false,
        user: data.user || null,
        pending: data.pending || false,
        googleConfigured: data.googleConfigured || false,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  };

  useEffect(() => {
    checkAuth();
    const onAuth = () => checkAuth();
    window.addEventListener("auth", onAuth);
    return () => window.removeEventListener("auth", onAuth);
  }, []);

  return state;
}
