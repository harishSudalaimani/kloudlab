import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Auth0Provider as SdkAuth0Provider, useAuth0 } from '@auth0/auth0-react'

export interface AuthUser {
  sub: string
  username?: string
  name?: string
  email?: string
  picture?: string
}

export function authDisplayName(user: AuthUser | null): string | undefined {
  return user?.username?.trim() || user?.name?.trim() || user?.email?.trim() || undefined
}

interface AuthContextValue {
  configured: boolean
  apiConfigured: boolean
  loading: boolean
  user: AuthUser | null
  accessToken: string | null
  error: string
  login: (mode?: 'login' | 'signup', email?: string, returnTo?: string) => Promise<void>
  logout: () => void
}

const config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN?.trim(),
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID?.trim(),
  audience: import.meta.env.VITE_AUTH0_AUDIENCE?.trim(),
}
const configured = Boolean(config.domain && config.clientId)
const AuthContext = createContext<AuthContextValue | null>(null)

function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith('/')) return '/'
  try {
    const target = new URL(value, window.location.origin)
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/playground'
  } catch { return '/' }
}

function AuthBridge({ children }: { children: ReactNode }) {
  const {
    isLoading,
    isAuthenticated,
    user: sdkUser,
    error: sdkError,
    loginWithRedirect,
    logout: sdkLogout,
    getAccessTokenSilently,
  } = useAuth0()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenError, setTokenError] = useState('')

  useEffect(() => {
    if (!isAuthenticated || !config.audience) {
      setAccessToken(null)
      setTokenError('')
      setTokenLoading(false)
      return
    }

    let cancelled = false
    setTokenLoading(true)
    void getAccessTokenSilently().then((token) => {
      if (!cancelled) {
        setAccessToken(token ?? null)
        setTokenError(token ? '' : 'Auth0 did not return an API access token.')
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setAccessToken(null)
        setTokenError(error instanceof Error ? error.message : 'Could not get an API access token.')
      }
    }).finally(() => {
      if (!cancelled) setTokenLoading(false)
    })
    return () => { cancelled = true }
  }, [getAccessTokenSilently, isAuthenticated])

  const login = useCallback(async (mode: 'login' | 'signup' = 'login', email?: string, returnTo = '/') => {
    const emailHint = email?.trim()
    await loginWithRedirect({
      appState: { returnTo: safeReturnTo(returnTo) },
      authorizationParams: {
        ...(mode === 'signup' ? { screen_hint: 'signup' } : {}),
        ...(emailHint ? { login_hint: emailHint } : {}),
      },
    })
  }, [loginWithRedirect])

  const logout = useCallback(() => {
    void sdkLogout({ logoutParams: { returnTo: `${window.location.origin}/` } })
  }, [sdkLogout])

  const user = sdkUser?.sub ? (() => {
    const namespacedUsername = Object.entries(sdkUser).find(([claim, value]) => claim.endsWith('/username') && typeof value === 'string')?.[1]
    const username = [sdkUser.username, sdkUser.preferred_username, namespacedUsername]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
    return {
      sub: sdkUser.sub,
      username,
      name: sdkUser.name,
      email: sdkUser.email,
      picture: sdkUser.picture,
    }
  })() : null
  const value = useMemo<AuthContextValue>(() => ({
    configured,
    apiConfigured: Boolean(config.audience),
    loading: isLoading || (isAuthenticated && tokenLoading),
    user,
    accessToken,
    error: tokenError || sdkError?.message || '',
    login,
    logout,
  }), [isLoading, isAuthenticated, tokenLoading, user, accessToken, tokenError, sdkError, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!configured) {
    const value: AuthContextValue = {
      configured: false,
      apiConfigured: Boolean(config.audience),
      loading: false,
      user: null,
      accessToken: null,
      error: '',
      login: async () => undefined,
      logout: () => window.location.assign('/'),
    }
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  }

  return (
    <SdkAuth0Provider
      domain={config.domain!}
      clientId={config.clientId!}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/`,
        ...(config.audience ? { audience: config.audience } : {}),
      }}
      onRedirectCallback={(appState) => {
        window.history.replaceState({}, '', safeReturnTo(appState?.returnTo))
        window.dispatchEvent(new PopStateEvent('popstate'))
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </SdkAuth0Provider>
  )
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
