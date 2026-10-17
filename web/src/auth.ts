const domain = import.meta.env.VITE_COGNITO_DOMAIN as string
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI as string
const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI as string
const scopes = (import.meta.env.VITE_COGNITO_SCOPES as string | undefined) ?? 'openid email'

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function signIn() {
  const random = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(random)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)))
  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('oauth_state', state)
  const url = new URL('/oauth2/authorize', domain)
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    scope: scopes, state, code_challenge: base64url(new Uint8Array(digest)), code_challenge_method: 'S256',
  }).toString()
  window.location.assign(url)
}

export async function handleCallback() {
  const params = new URLSearchParams(location.search)
  if (params.get('state') !== sessionStorage.getItem('oauth_state')) throw new Error('Sign-in state mismatch')
  const code = params.get('code')
  const verifier = sessionStorage.getItem('pkce_verifier')
  if (!code || !verifier) throw new Error('Sign-in response is incomplete')
  const response = await fetch(new URL('/oauth2/token', domain), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier }),
  })
  if (!response.ok) throw new Error('Cognito token exchange failed')
  const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in: number }
  sessionStorage.setItem('access_token', tokens.access_token)
  if (tokens.refresh_token) sessionStorage.setItem('refresh_token', tokens.refresh_token)
  sessionStorage.setItem('access_expires_at', String(Date.now() + tokens.expires_in * 1000))
  sessionStorage.removeItem('pkce_verifier')
  sessionStorage.removeItem('oauth_state')
  location.replace('/')
}

export async function accessToken(): Promise<string | null> {
  const access = sessionStorage.getItem('access_token')
  const expires = Number(sessionStorage.getItem('access_expires_at') ?? 0)
  if (access && Date.now() < expires - 30_000) return access
  const refresh = sessionStorage.getItem('refresh_token')
  if (!refresh) return null
  const response = await fetch(new URL('/oauth2/token', domain), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh }),
  })
  if (!response.ok) { signOut(); return null }
  const tokens = await response.json() as { access_token: string; expires_in: number }
  sessionStorage.setItem('access_token', tokens.access_token)
  sessionStorage.setItem('access_expires_at', String(Date.now() + tokens.expires_in * 1000))
  return tokens.access_token
}

export async function signOut() {
  const refresh = sessionStorage.getItem('refresh_token')
  sessionStorage.clear()
  if (refresh) {
    await fetch(new URL('/oauth2/revoke', domain), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, token: refresh }),
    }).catch(() => undefined)
  }
  const url = new URL('/logout', domain)
  url.search = new URLSearchParams({ client_id: clientId, logout_uri: logoutUri }).toString()
  window.location.assign(url)
}
