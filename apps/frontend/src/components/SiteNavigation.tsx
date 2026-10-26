import { Icon } from './Icon'

export type AppPage = 'home' | 'about' | 'playground' | 'login' | 'signup'
export type Theme = 'dark' | 'light'

interface SiteNavigationProps {
  page: AppPage
  theme: Theme
  onNavigate: (page: AppPage) => void
  onToggleTheme: () => void
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
      <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  )
}

export function SiteNavigation({ page, theme, onNavigate, onToggleTheme, variant = 'marketing' }: SiteNavigationProps) {
  if (variant === 'workspace') {
    return (
      <div className="workspace-nav">
        <PageLinks page={page} onNavigate={onNavigate} />
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
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button className="site-auth-link" onClick={() => onNavigate('login')}>Log in</button>
        <button className="button button-primary site-cta" onClick={() => onNavigate('signup')}>Sign up<Icon name="arrow-up-right" size={15} /></button>
      </div>
    </header>
  )
}
