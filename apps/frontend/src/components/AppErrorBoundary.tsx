import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('KloudLab frontend render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="frontend-error-screen" role="alert">
        <div className="frontend-error-mark">!</div>
        <span className="eyebrow">KLOUDLAB</span>
        <h1>We couldn’t open this design</h1>
        <p>Reload the page to continue working.</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>Reload canvas</button>
      </main>
    )
  }
}
