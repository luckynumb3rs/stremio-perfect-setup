import React from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import App from './App';
import { relayBingecatCallback } from './lib/bingecatAuth';

// The BingeCat OAuth popup lands here with ?code&state: hand it to the wizard window and render nothing else.
if (!relayBingecatCallback()) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
