import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { accessToken, handleCallback, signIn, signOut } from './auth'
import './style.css'

type Lab = { slug: string; version: string; title: string; description: string; tasks: { id: string; title: string }[] }
type Session = { id: string; lab_slug: string; status: string; expires_at: string }
const api = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  if (!token) throw new Error('Please sign in again.')
  const response = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `Request failed (${response.status})`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(sessionStorage.getItem('access_token') || sessionStorage.getItem('refresh_token')))
  const [labs, setLabs] = useState<Lab[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (location.pathname === '/callback') {
      handleCallback().catch((error: Error) => setMessage(error.message))
      return
    }
    if (!loggedIn) return
    Promise.all([request<{ items: Lab[] }>('/api/labs'), request<{ items: Session[] }>('/api/sessions')])
      .then(([catalog, active]) => { setLabs(catalog.items); setSessions(active.items) })
      .catch((error: Error) => setMessage(error.message))
  }, [loggedIn])

  async function start(slug: string) {
    setBusy(true); setMessage('Provisioning your lab…')
    try {
      const session = await request<Session>('/api/sessions', { method: 'POST', body: JSON.stringify({ lab_slug: slug }) })
      setSessions((all) => [session, ...all]); setMessage('Lab is ready. Open its access handoff to connect.')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function evaluate(id: string) {
    try {
      const result = await request<{ passed: boolean; score: number }>(`/api/sessions/${id}/evaluate`, { method: 'POST' })
      setMessage(result.passed ? `Task passed. Score: ${result.score}/100.` : 'Task is not complete yet.')
    } catch (error) { setMessage((error as Error).message) }
  }

  async function openAccess(id: string) {
    try {
      const grant = await request<{ stream_url: string; token: string }>(`/api/sessions/${id}/access`, { method: 'POST' })
      // Keep this short-lived SSM grant in memory only; never persist it in browser storage.
      setMessage(`Temporary Session Manager access granted for ${new URL(grant.stream_url).host}. A browser session relay is required to open the terminal.`)
    } catch (error) { setMessage((error as Error).message) }
  }

  if (location.pathname === '/callback') return <main><h1>Signing in…</h1><p>{message}</p></main>
  if (!loggedIn) return <main className="welcome"><span className="eyebrow">CLOUDLAB / AWS LABS</span><h1>Practice in a real cloud environment.</h1><p>Launch isolated infrastructure, complete guided tasks, and get your work checked by the platform.</p><button onClick={() => void signIn()}>Sign in with Cognito</button></main>

  return <main>
    <header><div><span className="eyebrow">CLOUDLAB / AWS LABS</span><h1>Your learning workspace</h1></div><button className="quiet" onClick={signOut}>Sign out</button></header>
    {message && <p role="status" className="message">{message}</p>}
    <section><h2>Lab catalog</h2><div className="cards">{labs.map((lab) => <article key={lab.slug}>
      <span className="eyebrow">AWS · VERSION {lab.version}</span><h3>{lab.title}</h3><p>{lab.description}</p><button disabled={busy} onClick={() => void start(lab.slug)}>Start lab</button>
    </article>)}</div></section>
    <section><h2>Your sessions</h2>{sessions.length === 0 ? <p>No sessions yet.</p> : <div className="session-list">{sessions.map((session) => <article key={session.id} className="session">
      <div><strong>{session.lab_slug}</strong><p>{session.status} · expires {new Date(session.expires_at).toLocaleTimeString()}</p></div>
      <div className="actions"><button className="quiet" onClick={() => void openAccess(session.id)}>Access</button><button className="quiet" onClick={() => void evaluate(session.id)}>Check task</button></div>
    </article>)}</div>}</section>
    <footer>CloudLab uses short-lived, owner-scoped access grants. Your account credentials stay with Cognito.</footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
