import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './wasm_exec.js' 

async function initWasm() {
  const go = new window.Go(); 

  const result = await WebAssembly.instantiateStreaming(
    fetch('/main.wasm'), 
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