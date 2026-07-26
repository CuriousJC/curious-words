import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './quotes.css'

// StrictMode double-invokes effects in development only, which surfaces missing
// cleanup. It compiles out of the production build entirely.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
