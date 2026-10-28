import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/closet/:token" element={<App />} />
        <Route path="*" element={
          <div className="error-state">
            <h1>OOTD Shared Closet</h1>
            <p>Please use a valid share link to view a closet.</p>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
