import { Icon } from './Icon'
import type { AppPage } from './SiteNavigation'
import { GITHUB_REPOSITORY_URL } from '../domain/links'

export function SiteFooter({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <a className="brand site-footer-logo" href="/" onClick={(event) => { event.preventDefault(); onNavigate('home') }} aria-label="KloudLab home">
          <span className="brand-mark"><i /><i /><i /></span><span>kloud<span>lab</span></span>
        </a>
        <p>Design cloud-native platforms with open-source building blocks.</p>
      </div>
      <nav className="site-footer-links" aria-label="Footer navigation">
        <button onClick={() => onNavigate('home')}>Home</button>
        <button onClick={() => onNavigate('about')}>About</button>
        <button onClick={() => onNavigate('playground')}>Playground<Icon name="arrow-up-right" size={13} /></button>
        <a className="site-repo-link" href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="KloudLab on GitHub" title="KloudLab on GitHub"><Icon name="github" size={17} /></a>
      </nav>
      <div className="site-footer-bottom"><span>© {new Date().getFullYear()} KloudLab</span><span>Open source. Cloud by choice.</span></div>
    </footer>
  )
}
