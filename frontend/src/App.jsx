import CSVUploader from './components/CSVUploader'
import FactorialBenchmark from './components/FactorialBenchmark'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <h1>WebAssembly CSV Parser</h1>
      <CSVUploader />
      <FactorialBenchmark />
    </div>
  )
}
