import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { API_BASE_URL } from './config'

// Wake the (free-tier) API while the page and login screen load, so the first real request isn't a cold start.
fetch(`${API_BASE_URL}/api/health`, { cache: 'no-store' }).catch(() => {})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
