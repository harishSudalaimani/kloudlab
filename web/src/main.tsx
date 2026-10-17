import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
type Track = { slug: string; title: string; short: string; description: string; symbol: string; labs: string[] }

const tracks: Track[] = [
  { slug: 'kubernetes', title: 'Kubernetes', short: 'K8s', description: 'Build, deploy, and troubleshoot workloads on real Kubernetes clusters.', symbol: '⌘', labs: ['Your first Kubernetes deployment', 'Services and cluster networking', 'Configuration, secrets, and storage'] },
  { slug: 'aws', title: 'Amazon Web Services', short: 'AWS', description: 'Learn core AWS services through focused, guided cloud exercises.', symbol: '↗', labs: ['S3 and static website hosting', 'IAM roles and least privilege', 'VPC networking fundamentals'] },
  { slug: 'gcp', title: 'Google Cloud', short: 'GCP', description: 'Explore Google Cloud building blocks and practical deployment workflows.', symbol: '◈', labs: ['Cloud Storage essentials', 'Deploy a container to Cloud Run', 'Networks, IAM, and service accounts'] },
  { slug: 'oracle', title: 'Oracle Cloud', short: 'OCI', description: 'Get hands-on with OCI compute, networking, and cloud foundations.', symbol: '◎', labs: ['Create an OCI compute instance', 'Virtual cloud networks', 'Object Storage basics'] },
  { slug: 'azure', title: 'Microsoft Azure', short: 'AZ', description: 'Practice cloud infrastructure and application workflows on Azure.', symbol: '◇', labs: ['Azure storage and access', 'Virtual networks and security', 'Deploy a container app'] },
  { slug: 'ci-cd', title: 'CI/CD', short: 'CI/CD', description: 'Build reliable delivery pipelines from commit to deployment.', symbol: '⟳', labs: ['Build and test with GitHub Actions', 'Publish a container image', 'Deploy with Argo CD'] },
  { slug: 'observability', title: 'Observability', short: 'O11Y', description: 'Understand system behavior through metrics, logs, and traces.', symbol: '⌁', labs: ['Explore service metrics', 'Find issues in application logs', 'Trace a request across services'] },
]

function Brand() {
  return <a className="brand" href="/" aria-label="KloudLab home"><img className="brand-mark" src="/kloudlab-mark.svg" alt="" /><span>Kloud<span className="brand-light">Lab</span></span></a>
}

function ThemeButton({ theme, toggle }: { theme: string; toggle: () => void }) {
  return <button className="theme-button" type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
    <span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span><span className="theme-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
  </button>
}

function Header({ theme, toggle }: { theme: string; toggle: () => void }) {
  return <header className="site-header">
    <div className="header-inner">
      <Brand />
      <nav className="main-nav" aria-label="Main navigation">
        <a className="nav-labs" href="/labs">Labs</a><a href="/about">About</a><a href="/faq">FAQ</a>
      </nav>
      <div className="header-actions"><ThemeButton theme={theme} toggle={toggle} /><a className="button button-small" href="/labs">Explore labs <span aria-hidden="true">↗</span></a></div>
    </div>
  </header>
}

function Footer() {
  return <footer className="site-footer"><div className="footer-top"><Brand /><p>Practical learning for cloud and platform engineering.</p></div><div className="footer-bottom"><span>© {new Date().getFullYear()} KloudLab</span><div><a href="/labs">Labs</a><a href="/about">About</a><a href="/faq">FAQ</a></div></div></footer>
}

function TrackCard({ track, index }: { track: Track; index: number }) {
  return <a className="track-card" href={`/labs/${track.slug}`} style={{ animationDelay: `${index * 45}ms` }}>
    <div className="track-card-top"><span className="track-symbol" aria-hidden="true">{track.symbol}</span><span className="track-short">{track.short}</span></div>
    <h3>{track.title}</h3><p>{track.description}</p>
    <div className="track-card-bottom"><span>{track.labs.length} practice topics</span><span className="arrow" aria-hidden="true">↗</span></div>
  </a>
}

function LandingPage() {
  return <>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="status-pill"><span className="status-dot" /> Hands-on learning for cloud and platform skills</div>
          <h1>Cloud skills come from <span className="gradient-text">getting your hands dirty.</span></h1>
          <p className="hero-lede">Build practical skills across Kubernetes, cloud platforms, CI/CD, and observability through focused, hands-on challenges.</p>
          <div className="hero-actions"><a className="button" href="/labs">Explore labs <span aria-hidden="true">↗</span></a><a className="text-link" href="/about">What is KloudLab? <span aria-hidden="true">→</span></a></div>
        </div>
        <div className="hero-art" aria-label="Illustration of a guided Kubernetes lab">
          <div className="art-glow" />
          <div className="terminal-window"><div className="terminal-bar"><div className="window-dots"><i /><i /><i /></div><span>kloudlab / kubernetes-01</span><span className="terminal-live"><i /> GUIDED LAB</span></div>
            <div className="terminal-body"><div className="terminal-side"><span className="side-active">01</span><span>02</span><span>03</span><span className="side-line" /></div><div className="terminal-code"><div className="code-muted"># Your first Kubernetes deployment</div><div><span className="code-purple">apiVersion</span>: <span className="code-green">apps/v1</span></div><div><span className="code-purple">kind</span>: <span className="code-orange">Deployment</span></div><div><span className="code-purple">metadata</span>:</div><div className="code-indent"><span className="code-purple">name</span>: <span className="code-green">hello-cloud</span></div><div><span className="code-purple">spec</span>:</div><div className="code-indent"><span className="code-purple">replicas</span>: <span className="code-orange">2</span></div><div className="code-indent"><span className="code-purple">template</span>:</div><div className="code-indent code-indent-more"><span className="code-purple">containers</span>: <span className="code-muted"># build it, then see it run</span></div><div className="code-prompt"><span>❯</span> kubectl apply -f deployment.yaml <b>▌</b></div></div></div>
            <div className="terminal-footer"><span><i className="green-dot" /> Kubernetes · Foundations</span><span>01 / 03</span></div>
          </div>
          <div className="floating-note"><span className="note-icon">✦</span><span><b>Learn by building</b><small>Short guided challenges</small></span></div>
          <span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" />
        </div>
      </section>

      <section className="trust-strip"><span>Explore the skills that power modern technology</span><div><span>KUBERNETES</span><span>AWS</span><span>CI / CD</span><span>OBSERVABILITY</span><span>+ MORE</span></div></section>

      <section className="section-block" id="tracks">
        <div className="section-heading"><div><span className="eyebrow">YOUR NEXT SKILL STARTS HERE</span><h2>Pick a path. <span className="muted-text">Make it real.</span></h2><p>Explore cloud platforms and engineering skills through labs designed to build practical confidence.</p></div><a className="text-link desktop-link" href="/labs">Browse all labs <span aria-hidden="true">→</span></a></div>
        <div className="track-grid">{tracks.slice(0, 4).map((track, index) => <TrackCard key={track.slug} track={track} index={index} />)}</div>
        <div className="track-grid track-grid-secondary">{tracks.slice(4).map((track, index) => <TrackCard key={track.slug} track={track} index={index + 4} />)}</div>
      </section>

      <section className="how-section"><div className="how-intro"><span className="eyebrow">BUILT FOR LEARNING BY DOING</span><h2>Less watching.<br /><span className="gradient-text">More making.</span></h2><p>Learn by working through concrete tasks with the tools used across cloud and platform engineering.</p></div>
        <div className="steps"><article className="step-card"><span className="step-number">01</span><div className="step-icon">⌕</div><h3>Choose a skill</h3><p>Explore focused topics across cloud platforms and engineering tools.</p></article><article className="step-card"><span className="step-number">02</span><div className="step-icon">⌘</div><h3>Work through it</h3><p>Follow a guided challenge and practice with tools used in the real world.</p></article><article className="step-card"><span className="step-number">03</span><div className="step-icon">↗</div><h3>Build confidence</h3><p>Understand what you built, why it works, and where to take the skill next.</p></article></div>
      </section>

      <section className="launch-banner"><div className="launch-decoration">KL</div><div className="launch-content"><span className="eyebrow">PRACTICE THAT MOVES YOU FORWARD</span><h2>Make complex cloud tools feel approachable.</h2><p>Explore practical learning paths for Kubernetes, cloud platforms, and modern engineering teams.</p></div><a className="button button-light" href="/labs">Explore learning paths <span aria-hidden="true">↗</span></a></section>
    </main>
    <Footer />
  </>
}

function LabsPage() {
  return <><main className="page-main"><div className="breadcrumb"><a href="/">Home</a><span>/</span><span>Labs</span></div><section className="page-intro"><span className="eyebrow">EXPLORE KLOUDLAB</span><h1>Find your <span className="gradient-text">next challenge.</span></h1><p>Explore practical topics across cloud platforms and the tools that power modern engineering.</p></section><div className="track-grid track-grid-page">{tracks.map((track, index) => <TrackCard key={track.slug} track={track} index={index} />)}</div></main><Footer /></>
}

function TrackPage({ slug }: { slug: string }) {
  const track = tracks.find((item) => item.slug === slug)
  if (!track) return <NotFound />
  return <><main className="page-main"><div className="breadcrumb"><a href="/">Home</a><span>/</span><a href="/labs">Labs</a><span>/</span><span>{track.title}</span></div><section className="track-hero"><span className="track-symbol large-symbol">{track.symbol}</span><span className="eyebrow">KLOUDLAB · {track.short} LEARNING PATH</span><h1>{track.title} <span className="gradient-text">labs.</span></h1><p>{track.description}</p></section><section className="lab-list-section"><div className="section-heading"><div><span className="eyebrow">PRACTICE TOPICS</span><h2>Explore {track.title}</h2></div><span className="count-label">{track.labs.length} TOPICS</span></div><div className="lab-list">{track.labs.map((lab, index) => <article className="lab-row" key={lab}><span className="lab-index">0{index + 1}</span><div className="lab-row-main"><h3>{lab}</h3><p>Guided, hands-on practice</p></div><span className="lab-status">{track.short}</span></article>)}</div></section><section className="other-tracks"><div className="section-heading"><div><span className="eyebrow">KEEP EXPLORING</span><h2>More learning paths</h2></div><a className="text-link" href="/labs">See all <span aria-hidden="true">→</span></a></div><div className="track-grid track-grid-compact">{tracks.filter((item) => item.slug !== track.slug).slice(0, 3).map((item, index) => <TrackCard key={item.slug} track={item} index={index} />)}</div></section></main><Footer /></>
}

function AboutPage() {
  return <><main className="page-main about-page"><div className="breadcrumb"><a href="/">Home</a><span>/</span><span>About</span></div><section className="page-intro"><span className="eyebrow">WHY KLOUDLAB</span><h1>Confidence comes from <span className="gradient-text">doing the work.</span></h1><p>KloudLab is a hands-on learning platform for cloud and platform engineering, designed to turn complex tools into practical skills.</p></section><section className="about-story"><div className="story-marker"><img className="story-mark" src="/kloudlab-mark.svg" alt="" /><span className="story-line" /></div><div><span className="eyebrow">OUR APPROACH</span><h2>Turn complex tools into practical learning.</h2><p>Cloud platforms and Kubernetes are powerful, but documentation and videos alone can leave a gap between knowing the terms and knowing what to do. KloudLab focuses on guided practice that helps learners understand the tools by working through clear, concrete challenges.</p><p>Explore learning paths across Kubernetes, AWS, Google Cloud, Oracle Cloud, Azure, CI/CD, and observability.</p></div></section><section className="values-grid"><article><span className="value-symbol">01</span><h3>Practice with purpose</h3><p>Every challenge focuses on a useful skill and a clear outcome.</p></article><article><span className="value-symbol">02</span><h3>Learn in small steps</h3><p>Focused practice makes complex systems easier to understand.</p></article><article><span className="value-symbol">03</span><h3>Connect the concepts</h3><p>See how cloud infrastructure, automation, and operations work together.</p></article></section><section className="about-cta"><span className="eyebrow">BUILD PRACTICAL SKILLS</span><h2>Choose a path to explore.</h2><p>Discover the tools and topics covered across KloudLab.</p><a className="button" href="/labs">Explore learning paths <span aria-hidden="true">↗</span></a></section></main><Footer /></>
}

function FaqPage() {
  const questions = [
    { question: 'What is KloudLab?', answer: 'KloudLab is a hands-on learning platform focused on cloud infrastructure and platform engineering.' },
    { question: 'What can I learn?', answer: 'Explore Kubernetes, AWS, Google Cloud, Oracle Cloud, Microsoft Azure, CI/CD, and observability.' },
    { question: 'How are the learning paths organized?', answer: 'Paths are grouped by platform or engineering discipline, with focused topics that build practical understanding step by step.' },
    { question: 'Who is KloudLab for?', answer: 'KloudLab is for students, developers, and IT professionals who want to strengthen their cloud and platform engineering skills.' },
    { question: 'What makes hands-on practice useful?', answer: 'Working through a concrete task helps connect concepts to the tools and workflows used by engineering teams.' },
  ]
  return <><main className="page-main faq-page"><div className="breadcrumb"><a href="/">Home</a><span>/</span><span>FAQ</span></div><section className="page-intro"><span className="eyebrow">GOOD QUESTIONS</span><h1>What to know about <span className="gradient-text">KloudLab.</span></h1><p>Learn about KloudLab’s approach to cloud and platform engineering.</p></section><section className="faq-list">{questions.map((item, index) => <details className="faq-item" key={item.question}><summary><span className="faq-index">0{index + 1}</span><span>{item.question}</span><span className="faq-toggle" aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</section><section className="faq-contact"><div><span className="eyebrow">START EXPLORING</span><h2>Choose a skill to build.</h2></div><a className="button" href="/labs">Browse learning paths <span aria-hidden="true">↗</span></a></section></main><Footer /></>
}

function NotFound() {
  return <><main className="page-main not-found"><span className="eyebrow">404 · PAGE NOT FOUND</span><h1>We can’t find that page.</h1><p>Explore KloudLab’s learning paths to find a topic that interests you.</p><a className="button" href="/labs">Browse learning paths <span aria-hidden="true">↗</span></a></main><Footer /></>
}

function PublicSite({ theme, toggle }: { theme: string; toggle: () => void }) {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const trackPrefix = '/labs/'
  const trackSlug = path.startsWith(trackPrefix) ? path.slice(trackPrefix.length) : ''
  let content: React.ReactNode
  if (path === '/') content = <LandingPage />
  else if (path === '/about') content = <AboutPage />
  else if (path === '/faq') content = <FaqPage />
  else if (path === '/labs') content = <LabsPage />
  else if (trackSlug) content = <TrackPage slug={trackSlug} />
  else content = <NotFound />
  return <div className="site-shell"><Header theme={theme} toggle={toggle} />{content}</div>
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('kloudlab-theme') || 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kloudlab-theme', theme)
  }, [theme])
  const toggle = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')
  return <PublicSite theme={theme} toggle={toggle} />
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
