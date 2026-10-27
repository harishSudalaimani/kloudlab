import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { SiteNavigation, type AppPage, type Theme } from '../components/SiteNavigation'
import { SiteFooter } from '../components/SiteFooter'
import { useAuth } from '../auth/AuthProvider'

interface AuthPageProps {
  mode: 'login' | 'signup'
  theme: Theme
  onNavigate: (page: AppPage) => void
  onToggleTheme: () => void
}

export function AuthPage({ mode, theme, onNavigate, onToggleTheme }: AuthPageProps) {
  const [email, setEmail] = useState('')
  const auth = useAuth()
  const isSignup = mode === 'signup'
  const requestedReturnTo = new URLSearchParams(window.location.search).get('returnTo')
  const returnTo = requestedReturnTo ?? (window.location.pathname.replace(/\/+$/, '') === '/playground' ? '/playground' : '/')

  const beginSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void auth.login(mode, email, returnTo)
  }

  return (
    <div className="marketing-page auth-page">
      <SiteNavigation page={mode} theme={theme} authenticated={Boolean(auth.user)} accountName={auth.user?.name ?? auth.user?.email} onNavigate={onNavigate} onToggleTheme={onToggleTheme} onLogout={auth.logout} />
      <main className="auth-layout">
        <section className="auth-story">
          <span className="auth-story-kicker"><i />KLOUDLAB WORKSPACE</span>
          <h1>{isSignup ? <>Build your platform<br /><em>in the open.</em></> : <>Your architecture,<br /><em>right where you left it.</em></>}</h1>
          <p>{isSignup ? 'Create an account to keep your cloud architecture work together.' : 'Sign in to return to your cloud architecture workspace.'}</p>
          <div className="auth-story-canvas" aria-hidden="true">
            <span className="auth-story-line line-one" /><span className="auth-story-line line-two" />
            <div className="auth-story-node node-one"><i>KS</i><span><small>COMPUTE</small><b>Kubernetes</b></span></div>
            <div className="auth-story-node node-two"><i>PG</i><span><small>DATA</small><b>PostgreSQL</b></span></div>
            <div className="auth-story-node node-three"><i>OT</i><span><small>OBSERVABILITY</small><b>OpenTelemetry</b></span></div>
          </div>
          <div className="auth-story-foot"><Icon name="layers" size={15} /><span>{'Open-source tools. Your choice of cloud.'}</span></div>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-card-intro">{isSignup ? 'Create an account to start designing.' : 'Sign in to continue to your workspace.'}</p>
          <form onSubmit={beginSignIn}>
            <label className="auth-email-label" htmlFor="auth-email">Email</label>
            <div className="auth-email-field"><Icon name="mail" size={17} /><input id="auth-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <button className="button button-primary auth-submit" type="submit" disabled={!auth.configured || auth.loading}>{isSignup ? 'Create account' : 'Continue'}<Icon name="arrow-up-right" size={16} /></button>
          </form>
          {(auth.error || !auth.configured) && <div className="auth-notice" role="status"><Icon name="info" size={15} /><span>{auth.configured ? 'We couldn’t complete sign-in. Please try again.' : 'Sign-in is temporarily unavailable. Please try again later.'}</span></div>}
          <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to KloudLab?'} <button onClick={() => onNavigate(isSignup ? 'login' : 'signup')}>{isSignup ? 'Log in' : 'Sign up'}</button></p>
          <button className="auth-back-link" onClick={() => onNavigate('home')}><Icon name="arrow-left" size={14} />Back to home</button>
        </section>
      </main>
      <SiteFooter onNavigate={onNavigate} />
    </div>
  )
}
