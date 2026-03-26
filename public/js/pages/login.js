import { html } from "htm/preact";

export function Login({ pending, googleConfigured }) {
  if (pending) {
    return html`
      <div class="login-page">
        <div class="login-card">
          <h1>KoldenHome</h1>
          <p class="login-message">Your account is pending approval.</p>
          <p class="login-hint">Ask the admin to approve your account from localhost.</p>
        </div>
      </div>
    `;
  }

  return html`
    <div class="login-page">
      <div class="login-card">
        <h1>KoldenHome</h1>
        ${googleConfigured
          ? html`<a href="/api/auth/google" class="google-btn">Sign in with Google</a>`
          : html`<p class="login-message">Google OAuth is not configured.</p>
                 <p class="login-hint">Set <code>google.client_id</code> and <code>google.client_secret</code> in the config table.</p>`
        }
      </div>
    </div>
  `;
}
