import { useState } from 'react';
import { useJsWorker } from '../hooks/useJsWorker';
import { useWasmWorker } from '../hooks/useWasmWorker';
import { useRustWorker } from '../hooks/useRustWorker';
import './FactorialBenchmark.css';

export default function FactorialBenchmark() {
  const [num, setNum] = useState(100);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const { isReady: jsReady, postAction: jsPost } = useJsWorker();
  const { isReady: goReady, postAction: goPost } = useWasmWorker();
  const { isReady: rustReady, postAction: rustPost } = useRustWorker();

  const runBenchmark = async () => {
    if (!jsReady || !goReady || !rustReady) {
      alert("Workers are still initializing...");
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const n = parseInt(num, 10);
      if (isNaN(n) || n < 0) return;

      const jsRes = await jsPost('FACTORIAL', { n });
      const goRes = await goPost('FACTORIAL', { n });
      const rustRes = await rustPost('FACTORIAL', { n });

      setResults([
        { name: 'JavaScript', result: jsRes.data, time: jsRes.executionMs },
        { name: 'Go WASM', result: goRes.data, time: goRes.executionMs },
        { name: 'Rust WASM', result: rustRes.data, time: rustRes.executionMs }
      ]);
    } catch (err) {
      console.error("Benchmark failed", err);
    } finally {
      setLoading(false);
    }
  };

  const allReady = jsReady && goReady && rustReady;

  return (
    <div className="factorial-benchmark">
      <h2>Factorial Benchmark</h2>
      <div className="controls">
        <label>
          Calculate Factorial of:
          <input
            type="number"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            min="0"
          />
        </label>
        <button onClick={runBenchmark} disabled={loading || !allReady}>
          {loading ? 'Running...' : 'Run Benchmark'}
        </button>
      </div>

      {results.length > 0 && (
        <table className="benchmark-results">
          <thead>
            <tr>
              <th>Engine</th>
              <th>Time Taken (ms)</th>
              <th>Result Preview</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.time != null ? r.time.toFixed(4) : "N/A"} ms</td>
                <td title={String(r.result)}>
                  {String(r.result).length > 20 ? String(r.result).substring(0, 20) + "..." : String(r.result)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
