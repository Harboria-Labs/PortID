/**
 * <PortIDLogin /> React Component
 * 
 * Usage:
 *   import { PortIDLogin } from '@harboria-labs/portid-ui/react';
 * 
 *   function App() {
 *     return (
 *       <PortIDLogin
 *         appId="my-app"
 *         server="https://sync.portid.dev"
 *         onLogin={(username) => console.log('Logged in:', username)}
 *         onSignup={(username, recoveryKey) => console.log('Signed up:', username)}
 *         onRestore={(username, data) => console.log('Restored:', data)}
 *         theme="dark"
 *       />
 *     );
 *   }
 */

import { useState, useRef, useCallback } from 'react';

export function PortIDLogin({ appId, server = 'https://sync.portid.dev', onLogin, onSignup, onRestore, onError, theme = 'dark' }) {
  const [tab, setTab] = useState('login');
  const [msg, setMsg] = useState(null);
  const [recoveryKey, setRecoveryKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const sdkRef = useRef(null);

  const getSDK = useCallback(async () => {
    if (!sdkRef.current) {
      const { default: PortID } = await import('@harboria-labs/portid-js-sdk');
      sdkRef.current = new PortID(appId, server);
    }
    return sdkRef.current;
  }, [appId, server]);

  const showMsg = (text, type = 'info') => setMsg({ text, type });

  const handleLogin = async (e) => {
    e.preventDefault();
    const form = e.target;
    const user = form.username.value.trim();
    const pass = form.password.value;
    if (!user || !pass) return showMsg('Fill in all fields', 'error');

    setLoading(true);
    try {
      const sdk = await getSDK();
      const ok = await sdk.login(user, pass);
      if (ok) {
        showMsg(`Welcome back, ${user}!`, 'success');
        onLogin?.(user);
      } else {
        showMsg('Invalid credentials', 'error');
      }
    } catch (err) {
      showMsg(err.message, 'error');
      onError?.(err.message);
    }
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    const form = e.target;
    const user = form.username.value.trim();
    const pass = form.password.value;
    if (!user || !pass) return showMsg('Fill in all fields', 'error');
    if (pass.length < 8) return showMsg('Password must be 8+ characters', 'error');

    setLoading(true);
    try {
      const sdk = await getSDK();
      const result = await sdk.signUp(user, pass);
      setRecoveryKey(result.recoveryKey);
      showMsg('Account created!', 'success');
      onSignup?.(user, result.recoveryKey);
    } catch (err) {
      showMsg(err.message, 'error');
      onError?.(err.message);
    }
    setLoading(false);
  };

  const handleRestore = async (e) => {
    e.preventDefault();
    const form = e.target;
    const user = form.username.value.trim();
    const key = form.recoverykey.value.trim();
    if (!user || !key) return showMsg('Fill in all fields', 'error');

    setLoading(true);
    try {
      const sdk = await getSDK();
      const data = await sdk.restoreData(user, key);
      showMsg('Data restored!', 'success');
      onRestore?.(user, data);
    } catch (err) {
      showMsg(err.message, 'error');
      onError?.(err.message);
    }
    setLoading(false);
  };

  const isDark = theme === 'dark';
  const styles = {
    card: { maxWidth: 380, padding: 28, borderRadius: 16, border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`, background: isDark ? '#1a1a2e' : '#fff', color: isDark ? '#e0e0e0' : '#1f2937', fontFamily: '-apple-system, system-ui, sans-serif' },
    tabs: { display: 'flex', gap: 4, marginBottom: 20, background: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6', borderRadius: 8, padding: 3 },
    tab: (active) => ({ flex: 1, padding: 8, border: 'none', background: active ? (isDark ? 'rgba(99,102,241,0.15)' : '#fff') : 'transparent', color: active ? '#818cf8' : 'inherit', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', opacity: active ? 1 : 0.5 }),
    field: { marginBottom: 14 },
    label: { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'}`, borderRadius: 8, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb', color: 'inherit', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
    btn: { width: '100%', padding: 11, border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8, opacity: loading ? 0.5 : 1 },
    msg: (type) => ({ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 12, textAlign: 'center', background: type === 'success' ? 'rgba(16,185,129,0.1)' : type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)', color: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#818cf8' }),
    recovery: { marginTop: 16, padding: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 },
  };

  return (
    <div style={styles.card}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>🔐 PortID</h2>
        <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>Zero-knowledge encrypted sync</p>
      </div>

      <div style={styles.tabs}>
        {['login', 'signup', 'restore'].map(t => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => { setTab(t); setMsg(null); setRecoveryKey(null); }}>
            {t === 'login' ? 'Login' : t === 'signup' ? 'Sign Up' : 'Restore'}
          </button>
        ))}
      </div>

      {tab === 'login' && (
        <form onSubmit={handleLogin}>
          <div style={styles.field}><label style={styles.label}>Username</label><input name="username" style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Password</label><input name="password" type="password" style={styles.input} /></div>
          <button type="submit" style={styles.btn} disabled={loading}>{loading ? 'Logging in…' : 'Login'}</button>
        </form>
      )}

      {tab === 'signup' && (
        <form onSubmit={handleSignup}>
          <div style={styles.field}><label style={styles.label}>Username</label><input name="username" style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Password</label><input name="password" type="password" style={styles.input} /></div>
          <button type="submit" style={styles.btn} disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</button>
        </form>
      )}

      {tab === 'restore' && (
        <form onSubmit={handleRestore}>
          <div style={styles.field}><label style={styles.label}>Username</label><input name="username" style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Recovery Key</label><input name="recoverykey" style={styles.input} placeholder="Paste your recovery key" /></div>
          <button type="submit" style={styles.btn} disabled={loading}>{loading ? 'Restoring…' : 'Restore Data'}</button>
        </form>
      )}

      {msg && <div style={styles.msg(msg.type)}>{msg.text}</div>}

      {recoveryKey && (
        <div style={styles.recovery}>
          <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 8px', fontWeight: 600 }}>⚠️ Save this recovery key — it cannot be shown again:</p>
          <code style={{ display: 'block', fontSize: 11, wordBreak: 'break-all', padding: 8, background: isDark ? 'rgba(0,0,0,0.3)' : '#fefce8', borderRadius: 4, fontFamily: 'monospace', userSelect: 'all' }}>{recoveryKey}</code>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, opacity: 0.3 }}>Encrypted by PortID · Harboria Labs</div>
    </div>
  );
}

export default PortIDLogin;
