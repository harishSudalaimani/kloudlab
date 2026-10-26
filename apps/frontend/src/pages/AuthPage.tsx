import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { SiteNavigation, type AppPage, type Theme } from '../components/SiteNavigation'

interface AuthPageProps {
  mode: 'login' | 'signup'
  theme: Theme
  onNavigate: (page: AppPage) => void
  onToggleTheme: () => void
}

export function AuthPage({ mode, theme, onNavigate, onToggleTheme }: AuthPageProps) {
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const isSignup = mode === 'signup'

  const beginAuth0Flow = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('Auth0 tenant details are not configured yet. Connect the tenant to enable sign-in.')
  }

  return (
    <div className="marketing-page auth-page">
      <SiteNavigation page={mode} theme={theme} onNavigate={onNavigate} onToggleTheme={onToggleTheme} />
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
          <div className="auth-card-brand"><span className="auth-brand-mark"><Icon name="shield" size={19} /></span><span>SECURE ACCESS <i /> AUTH0</span></div>
          <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-card-intro">{isSignup ? 'Start designing and saving your platform architectures.' : 'Enter your email to continue to your workspace.'}</p>
          <form onSubmit={beginAuth0Flow}>
            <label className="auth-email-label" htmlFor="auth-email">Work email</label>
            <div className="auth-email-field"><Icon name="mail" size={17} /><input id="auth-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <button className="button button-primary auth-submit" type="submit">{isSignup ? 'Create account with Auth0' : 'Continue with Auth0'}<Icon name="arrow-up-right" size={16} /></button>
          </form>
          {notice && <div className="auth-notice" role="status"><Icon name="info" size={15} /><span>{notice}</span></div>}
          <div className="auth-divider"><span>SECURE ACCOUNT ACCESS</span></div>
          <p className="auth-provider-note"><Icon name="shield" size={15} />Auth0 will handle password entry and account security once the tenant is connected. KloudLab won’t store your credentials.</p>
          <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to KloudLab?'} <button onClick={() => onNavigate(isSignup ? 'login' : 'signup')}>{isSignup ? 'Log in' : 'Sign up'}</button></p>
          <button className="auth-back-link" onClick={() => onNavigate('home')}><Icon name="arrow-left" size={14} />Back to home</button>
        </section>
      </main>
      <footer className="auth-footer"><span>kloudlab</span><span>Open-source building blocks. Your choice of cloud.</span></footer>
    </div>
  )
}
