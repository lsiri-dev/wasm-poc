import CSVUploader from './components/CSVUploader'
import BenchmarkComparePage from './components/BenchmarkComparePage'
import './App.css'
import { useState } from 'react'

export default function App() {
  const [activePage, setActivePage] = useState('csv')

  return (
    <div className="app">
      <h1>WebAssembly CSV Parser</h1>
      <div className="flex-row" style={{ justifyContent: 'center', marginBottom: '16px' }}>
        <button type="button" onClick={() => setActivePage('csv')} disabled={activePage === 'csv'}>
          CSV Workspace
        </button>
        <button type="button" onClick={() => setActivePage('benchmark')} disabled={activePage === 'benchmark'}>
          Benchmark Compare
        </button>
      </div>

      {activePage === 'csv' ? <CSVUploader /> : <BenchmarkComparePage />}
    </div>
  )
}
