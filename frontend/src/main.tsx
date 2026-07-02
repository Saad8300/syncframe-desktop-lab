import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { BillingProvider } from './components/billing/BillingProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BillingProvider>
        <App />
      </BillingProvider>
    </AuthProvider>
  </React.StrictMode>,
)
