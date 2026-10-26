import React from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <React.StrictMode><App /></React.StrictMode>
  </AppErrorBoundary>,
)
