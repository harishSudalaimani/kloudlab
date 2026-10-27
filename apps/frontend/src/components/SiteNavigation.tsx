import { Icon } from './Icon'
import { GITHUB_REPOSITORY_URL } from '../domain/links'

export type AppPage = 'home' | 'about' | 'playground' | 'login' | 'signup'
export type Theme = 'dark' | 'light'

interface SiteNavigationProps {
  page: AppPage
  theme: Theme
  authenticated?: boolean
  accountName?: string
  onNavigate: (page: AppPage) => void
  onToggleTheme: () => void
  onLogout?: () => void
  variant?: 'marketing' | 'workspace'
}

const pageNames: Record<'home' | 'about' | 'playground', string> = {
  home: 'Home',
  about: 'About',
  playground: 'Playground',
}

function PageLinks({ page, onNavigate }: Pick<SiteNavigationProps, 'page' | 'onNavigate'>) {
  return (
    <nav className="site-page-links" aria-label="Main navigation">
      {(['home', 'about', 'playground'] as const).map((item) => (
        <a
          key={item}
          href={item === 'home' ? '/' : `/${item}`}
          className={page === item ? 'active' : ''}
          aria-current={page === item ? 'page' : undefined}
          onClick={(event) => { event.preventDefault(); onNavigate(item) }}
        >{pageNames[item]}</a>
      ))}
    </nav>
  )
}

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button className={`theme-toggle ${theme}`} type="button" onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'light'}>
      <span className="theme-toggle-track"><span className="theme-toggle-thumb" /><Icon name="moon" size={13} /><Icon name="sun" size={13} /></span>
    </button>
  )
}

export function SiteNavigation({ page, theme, authenticated = false, accountName, onNavigate, onToggleTheme, onLogout, variant = 'marketing' }: SiteNavigationProps) {
  if (variant === 'workspace') {
    return (
      <div className="workspace-nav">
        <PageLinks page={page} onNavigate={onNavigate} />
        <a className="site-github-link workspace-github-link" href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="KloudLab on GitHub" title="KloudLab on GitHub"><Icon name="github" size={16} /></a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    )
  }

  return (
    <header className="site-header">
      <a className="brand site-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('home') }} aria-label="KloudLab home">
        <span className="brand-mark"><i /><i /><i /></span><span>kloud<span>lab</span></span>
      </a>
      <PageLinks page={page} onNavigate={onNavigate} />
      <div className="site-header-actions">
        <a className="site-github-link" href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="KloudLab on GitHub" title="KloudLab on GitHub"><Icon name="github" size={18} /></a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        {authenticated ? <>
          <span className="site-session" title={accountName ? `Signed in as ${accountName}` : 'Signed in'}><i />{accountName || 'Signed in'}</span>
          <button className="site-auth-link" onClick={() => onLogout?.()}>Log out</button>
          <button className="button button-primary site-cta" onClick={() => onNavigate('playground')}>Open playground<Icon name="arrow-up-right" size={15} /></button>
        </> : <>
          <button className="site-auth-link" onClick={() => onNavigate('login')}>Log in</button>
          <button className="button button-primary site-cta" onClick={() => onNavigate('signup')}>Sign up<Icon name="arrow-up-right" size={15} /></button>
        </>}
      </div>
    </header>
  )
}
