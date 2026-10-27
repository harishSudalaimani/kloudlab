import { Icon } from '../components/Icon'
import { SiteNavigation, type AppPage, type Theme } from '../components/SiteNavigation'
import { SiteFooter } from '../components/SiteFooter'
import { catalog } from '../domain/catalog'

interface HomePageProps {
  theme: Theme
  authenticated: boolean
  accountName?: string
  onNavigate: (page: AppPage) => void
  onToggleTheme: () => void
  onLogout: () => void
}

const previewNodes = [
  { name: 'Kubernetes', type: 'COMPUTE', x: '7%', y: '37%', tone: 'green' },
  { name: 'Cilium', type: 'NETWORK', x: '38%', y: '16%', tone: 'blue' },
  { name: 'OpenFGA', type: 'AUTHORIZATION', x: '38%', y: '62%', tone: 'violet' },
  { name: 'OpenTelemetry', type: 'OBSERVABILITY', x: '68%', y: '37%', tone: 'orange' },
]

export function HomePage({ theme, authenticated, accountName, onNavigate, onToggleTheme, onLogout }: HomePageProps) {
  return (
    <div className="marketing-page home-page">
      <SiteNavigation page="home" theme={theme} authenticated={authenticated} accountName={accountName} onNavigate={onNavigate} onToggleTheme={onToggleTheme} onLogout={onLogout} />
      <main>
        <section className="home-hero">
          <div className="home-hero-copy">
            <div className="hero-kicker"><span />OPEN SOURCE, FROM THE FIRST BRICK</div>
            <h1>Design cloud platforms<br /><em>your way.</em></h1>
            <p>Bring open-source infrastructure, data, identity, and observability together on one architecture canvas.</p>
            <div className="hero-actions">
              <button className="button button-primary hero-primary" onClick={() => onNavigate('playground')}>{authenticated ? 'Continue designing' : 'Start designing'}<Icon name="arrow-up-right" size={17} /></button>
              <button className="hero-secondary" onClick={() => onNavigate('about')}>Why KloudLab?<Icon name="chevron-right" size={15} /></button>
            </div>
            <div className="hero-proof"><span><Icon name="layers" size={15} />{catalog.length}+ catalog tools</span><i /><span><Icon name="shield" size={15} />Open-source first</span><i /><span>Cloud for hosting</span></div>
          </div>

          <div className="hero-canvas-frame" aria-label="Example architecture diagram">
            <div className="hero-canvas-top"><span><i /><i /><i /></span><span>PLATFORM / OVERVIEW</span><span className="hero-live"><i />DESIGN</span></div>
            <div className="hero-canvas">
              <svg className="hero-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M23 49 C31 49 31 29 39 29" /><path d="M23 51 C31 51 31 70 39 70" /><path d="M55 29 C64 29 63 49 70 49" /><path d="M55 70 C64 70 63 51 70 51" />
              </svg>
              {previewNodes.map((node) => (
                <div className={`hero-map-node ${node.tone}`} key={node.name} style={{ left: node.x, top: node.y }}>
                  <span className="hero-map-glyph">{node.name.slice(0, 2).toUpperCase()}</span>
                  <span className="hero-map-copy"><small>{node.type}</small><strong>{node.name}</strong></span>
                  <span className="hero-map-port left" /><span className="hero-map-port right" />
                </div>
              ))}
              <div className="hero-canvas-scale"><span>−</span><span>100%</span><span>+</span></div>
            </div>
            <div className="hero-canvas-caption"><span><i />Architecture canvas</span><span>Drag · Connect · Compose</span></div>
          </div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        </section>

        <section className="home-principles">
          <div className="section-heading"><span>THE KLOUDLAB APPROACH</span><h2>One canvas. Your stack.</h2></div>
          <div className="principle-grid">
            <article><span className="principle-icon green"><Icon name="layers" size={19} /></span><small>01 / COMPOSE</small><h3>Choose your tools</h3><p>Explore a growing catalog of open-source projects across every layer of your platform.</p></article>
            <article><span className="principle-icon blue"><Icon name="link" size={19} /></span><small>02 / CONNECT</small><h3>See the whole system</h3><p>Arrange components, map relationships, and shape an architecture that fits your team.</p></article>
            <article><span className="principle-icon violet"><Icon name="shield" size={19} /></span><small>03 / GOVERN</small><h3>Design access clearly</h3><p>Model who can view and change resources with relationship-based authorization.</p></article>
          </div>
        </section>

        <section className="home-bottom-cta">
          <div><span>READY WHEN YOU ARE</span><h2>Start with an idea.<br />Build it in the open.</h2></div>
          <button className="button button-primary hero-primary" onClick={() => onNavigate('playground')}>Open the playground<Icon name="arrow-up-right" size={17} /></button>
        </section>
      </main>
      <SiteFooter onNavigate={onNavigate} />
    </div>
  )
}
