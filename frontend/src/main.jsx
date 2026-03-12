import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Initialize WASM
async function initWasm() {
  const response = await fetch('./main.wasm')
  const buffer = await response.arrayBuffer()
  const wasmModule = await WebAssembly.instantiate(buffer, {
    env: {},
    js: { mem: new WebAssembly.Memory({ initial: 256, maximum: 512 }) }
  })
  console.log('WASM module loaded:', wasmModule)
}

initWasm().catch(err => console.error('Failed to load WASM:', err))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
