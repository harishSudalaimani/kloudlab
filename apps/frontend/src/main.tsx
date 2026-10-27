import React from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>
  </AppErrorBoundary>,
)
