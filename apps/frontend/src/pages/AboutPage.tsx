import { Icon } from '../components/Icon'
import { SiteNavigation, type AppPage, type Theme } from '../components/SiteNavigation'
import { SiteFooter } from '../components/SiteFooter'

interface AboutPageProps {
  theme: Theme
  authenticated: boolean
  accountName?: string
  onNavigate: (page: AppPage) => void
  onToggleTheme: () => void
  onLogout: () => void
}

export function AboutPage({ theme, authenticated, accountName, onNavigate, onToggleTheme, onLogout }: AboutPageProps) {
  return (
    <div className="marketing-page about-page">
      <SiteNavigation page="about" theme={theme} authenticated={authenticated} accountName={accountName} onNavigate={onNavigate} onToggleTheme={onToggleTheme} onLogout={onLogout} />
      <main>
        <section className="about-hero">
          <div className="hero-kicker"><span />A PLATFORM FOR OPEN INFRASTRUCTURE</div>
          <h1>Cloud-native should mean<br /><em>open by design.</em></h1>
          <p>KloudLab is a visual workspace for designing platforms from open-source tools, with cloud providers available where hosting is needed.</p>
          <button className="button button-primary hero-primary" onClick={() => onNavigate('playground')}>Explore the playground<Icon name="arrow-up-right" size={17} /></button>
          <div className="about-hero-mark"><span>KL</span><i /><i /><i /></div>
        </section>

        <section className="about-story">
          <div className="about-story-title"><span>OUR POINT OF VIEW</span><h2>Build with the community.<br />Keep the choice yours.</h2></div>
          <div className="about-story-copy"><p>Modern platforms are assembled from many independent projects. KloudLab brings those building blocks into one place so teams can explore how their infrastructure fits together before they deploy it.</p><p>Our direction is open-source first: use community-built tools across the product, and choose AWS or another cloud when you need hosting or a managed Kubernetes service.</p></div>
        </section>

        <section className="about-pillars">
          <article><span>01</span><Icon name="book" size={20} /><h3>Open building blocks</h3><p>A broad catalog spanning infrastructure, Kubernetes, networking, data, identity, and operations.</p></article>
          <article><span>02</span><Icon name="grid" size={20} /><h3>Architecture in context</h3><p>A canvas that makes components and their relationships easier to understand and discuss.</p></article>
          <article><span>03</span><Icon name="shield" size={20} /><h3>Relationships as policy</h3><p>OpenFGA-inspired modeling helps teams reason about who can access each resource.</p></article>
        </section>

        <section className="about-note"><span className="principle-icon green"><Icon name="sparkles" size={20} /></span><div><small>THE GOAL</small><h2>Make a powerful cloud architecture feel understandable.</h2><p>Start visually. Add implementation details as the design becomes real.</p></div><button className="button button-outline" onClick={() => onNavigate('playground')}>Try the canvas<Icon name="arrow-up-right" size={15} /></button></section>
      </main>
      <SiteFooter onNavigate={onNavigate} />
    </div>
  )
}
