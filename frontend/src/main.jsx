import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './wasm_exec.js' 

async function initWasm() {
  const go = new window.Go(); 

  // Add a cache-busting query parameter so the browser always loads the freshly compiled .wasm
  const result = await WebAssembly.instantiateStreaming(
    fetch('/main.wasm?t=' + new Date().getTime()), 
    go.importObject 
  );

  go.run(result.instance);
  
  console.log('Go WASM Engine Loaded and Ready!');
}

initWasm().catch(err => console.error('Failed to load WASM:', err));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)