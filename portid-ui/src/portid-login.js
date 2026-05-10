/**
 * <portid-login> Web Component
 * 
 * A self-contained login/signup/restore UI for PortID.
 * Drop it into any HTML page. No framework required.
 * 
 * Usage:
 *   <script type="module" src="@harboria-labs/portid-ui"></script>
 *   <portid-login app-id="my-app" server="https://sync.portid.dev"></portid-login>
 * 
 * Events emitted:
 *   portid-login    — { detail: { username } }
 *   portid-signup   — { detail: { username, recoveryKey } }
 *   portid-restore  — { detail: { username, data } }
 *   portid-error    — { detail: { message } }
 */

const STYLES = `
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    max-width: 380px;
  }
  .portid-card {
    background: #1a1a2e;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 28px;
    color: #e0e0e0;
  }
  .portid-card.light {
    background: #fff;
    border-color: #e5e7eb;
    color: #1f2937;
  }
  .portid-header {
    text-align: center;
    margin-bottom: 20px;
  }
  .portid-header h2 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .portid-header p {
    font-size: 12px;
    opacity: 0.5;
    margin: 0;
  }
  .portid-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 3px;
  }
  .light .portid-tabs { background: #f3f4f6; }
  .portid-tab {
    flex: 1;
    padding: 8px;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.15s;
  }
  .portid-tab.active {
    background: rgba(99,102,241,0.15);
    color: #818cf8;
    opacity: 1;
  }
  .light .portid-tab.active { background: #fff; color: #4f46e5; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .portid-field {
    margin-bottom: 14px;
  }
  .portid-field label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.5;
    margin-bottom: 6px;
  }
  .portid-field input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    background: rgba(0,0,0,0.3);
    color: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .light .portid-field input { background: #f9fafb; border-color: #d1d5db; }
  .portid-field input:focus { border-color: #818cf8; }
  .portid-btn {
    width: 100%;
    padding: 11px;
    border: none;
    border-radius: 8px;
    background: #6366f1;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 8px;
  }
  .portid-btn:hover { background: #4f46e5; }
  .portid-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .portid-msg {
    margin-top: 12px;
    padding: 10px;
    border-radius: 8px;
    font-size: 12px;
    text-align: center;
  }
  .portid-msg.success { background: rgba(16,185,129,0.1); color: #10b981; }
  .portid-msg.error { background: rgba(239,68,68,0.1); color: #ef4444; }
  .portid-msg.info { background: rgba(99,102,241,0.1); color: #818cf8; }
  .portid-recovery {
    margin-top: 16px;
    padding: 12px;
    background: rgba(245,158,11,0.08);
    border: 1px solid rgba(245,158,11,0.2);
    border-radius: 8px;
  }
  .portid-recovery p { font-size: 11px; color: #f59e0b; margin: 0 0 8px; font-weight: 600; }
  .portid-recovery code {
    display: block;
    font-size: 11px;
    word-break: break-all;
    padding: 8px;
    background: rgba(0,0,0,0.3);
    border-radius: 4px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    user-select: all;
  }
  .light .portid-recovery code { background: #fefce8; }
  .portid-footer {
    text-align: center;
    margin-top: 16px;
    font-size: 10px;
    opacity: 0.3;
  }
  .hidden { display: none; }
`;

class PortIDLogin extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sdk = null;
    this._tab = 'login';
  }

  static get observedAttributes() {
    return ['app-id', 'server', 'theme'];
  }

  connectedCallback() {
    this.render();
  }

  get appId() { return this.getAttribute('app-id') || ''; }
  get server() { return this.getAttribute('server') || 'https://sync.portid.dev'; }
  get theme() { return this.getAttribute('theme') || 'dark'; }

  async _getSDK() {
    if (!this._sdk) {
      const { default: PortID } = await import('@harboria-labs/portid-js-sdk');
      this._sdk = new PortID(this.appId, this.server);
    }
    return this._sdk;
  }

  render() {
    const light = this.theme === 'light' ? ' light' : '';
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="portid-card${light}">
        <div class="portid-header">
          <h2>🔐 PortID</h2>
          <p>Zero-knowledge encrypted sync</p>
        </div>
        <div class="portid-tabs">
          <button class="portid-tab${this._tab === 'login' ? ' active' : ''}" data-tab="login">Login</button>
          <button class="portid-tab${this._tab === 'signup' ? ' active' : ''}" data-tab="signup">Sign Up</button>
          <button class="portid-tab${this._tab === 'restore' ? ' active' : ''}" data-tab="restore">Restore</button>
        </div>

        <!-- Login -->
        <div class="portid-form" data-form="login" ${this._tab !== 'login' ? 'class="hidden"' : ''}>
          <div class="portid-field"><label>Username</label><input type="text" id="login-user" autocomplete="username"></div>
          <div class="portid-field"><label>Password</label><input type="password" id="login-pass" autocomplete="current-password"></div>
          <button class="portid-btn" id="login-btn">Login</button>
        </div>

        <!-- Sign Up -->
        <div class="portid-form" data-form="signup" ${this._tab !== 'signup' ? 'style="display:none"' : ''}>
          <div class="portid-field"><label>Username</label><input type="text" id="signup-user" autocomplete="username"></div>
          <div class="portid-field"><label>Password</label><input type="password" id="signup-pass" autocomplete="new-password"></div>
          <button class="portid-btn" id="signup-btn">Create Account</button>
        </div>

        <!-- Restore -->
        <div class="portid-form" data-form="restore" ${this._tab !== 'restore' ? 'style="display:none"' : ''}>
          <div class="portid-field"><label>Username</label><input type="text" id="restore-user"></div>
          <div class="portid-field"><label>Recovery Key</label><input type="text" id="restore-key" placeholder="Paste your recovery key"></div>
          <button class="portid-btn" id="restore-btn">Restore Data</button>
        </div>

        <div id="msg" class="portid-msg hidden"></div>
        <div id="recovery" class="portid-recovery hidden"></div>
        <div class="portid-footer">Encrypted by PortID · Harboria Labs</div>
      </div>
    `;

    // Tab switching
    this.shadowRoot.querySelectorAll('.portid-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._tab = tab.dataset.tab;
        this.render();
      });
    });

    // Login
    this.shadowRoot.getElementById('login-btn')?.addEventListener('click', () => this._handleLogin());
    // Signup
    this.shadowRoot.getElementById('signup-btn')?.addEventListener('click', () => this._handleSignup());
    // Restore
    this.shadowRoot.getElementById('restore-btn')?.addEventListener('click', () => this._handleRestore());
  }

  _showMsg(text, type = 'info') {
    const el = this.shadowRoot.getElementById('msg');
    el.textContent = text;
    el.className = `portid-msg ${type}`;
  }

  _showRecovery(key) {
    const el = this.shadowRoot.getElementById('recovery');
    el.innerHTML = `<p>⚠️ Save this recovery key — it cannot be shown again:</p><code>${key}</code>`;
    el.classList.remove('hidden');
  }

  async _handleLogin() {
    const user = this.shadowRoot.getElementById('login-user').value.trim();
    const pass = this.shadowRoot.getElementById('login-pass').value;
    if (!user || !pass) return this._showMsg('Fill in all fields', 'error');

    const btn = this.shadowRoot.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Logging in…';

    try {
      const sdk = await this._getSDK();
      const ok = await sdk.login(user, pass);
      if (ok) {
        this._showMsg(`Welcome back, ${user}!`, 'success');
        this.dispatchEvent(new CustomEvent('portid-login', { detail: { username: user }, bubbles: true }));
      } else {
        this._showMsg('Invalid credentials', 'error');
      }
    } catch (e) {
      this._showMsg(e.message, 'error');
      this.dispatchEvent(new CustomEvent('portid-error', { detail: { message: e.message }, bubbles: true }));
    }
    btn.disabled = false; btn.textContent = 'Login';
  }

  async _handleSignup() {
    const user = this.shadowRoot.getElementById('signup-user').value.trim();
    const pass = this.shadowRoot.getElementById('signup-pass').value;
    if (!user || !pass) return this._showMsg('Fill in all fields', 'error');
    if (pass.length < 8) return this._showMsg('Password must be at least 8 characters', 'error');

    const btn = this.shadowRoot.getElementById('signup-btn');
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
      const sdk = await this._getSDK();
      const { recoveryKey } = await sdk.signUp(user, pass);
      this._showMsg('Account created!', 'success');
      this._showRecovery(recoveryKey);
      this.dispatchEvent(new CustomEvent('portid-signup', { detail: { username: user, recoveryKey }, bubbles: true }));
    } catch (e) {
      this._showMsg(e.message, 'error');
      this.dispatchEvent(new CustomEvent('portid-error', { detail: { message: e.message }, bubbles: true }));
    }
    btn.disabled = false; btn.textContent = 'Create Account';
  }

  async _handleRestore() {
    const user = this.shadowRoot.getElementById('restore-user').value.trim();
    const key = this.shadowRoot.getElementById('restore-key').value.trim();
    if (!user || !key) return this._showMsg('Fill in all fields', 'error');

    const btn = this.shadowRoot.getElementById('restore-btn');
    btn.disabled = true; btn.textContent = 'Restoring…';

    try {
      const sdk = await this._getSDK();
      const data = await sdk.restoreData(user, key);
      this._showMsg('Data restored successfully!', 'success');
      this.dispatchEvent(new CustomEvent('portid-restore', { detail: { username: user, data }, bubbles: true }));
    } catch (e) {
      this._showMsg(e.message, 'error');
      this.dispatchEvent(new CustomEvent('portid-error', { detail: { message: e.message }, bubbles: true }));
    }
    btn.disabled = false; btn.textContent = 'Restore Data';
  }
}

customElements.define('portid-login', PortIDLogin);
export default PortIDLogin;
