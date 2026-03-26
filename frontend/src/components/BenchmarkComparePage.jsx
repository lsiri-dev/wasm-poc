import { useState } from "react"
import { useWasmWorker } from "../hooks/useWasmWorker"
import { useJsWorker } from "../hooks/useJsWorker"

export default function BenchmarkComparePage() {
  const wasmWorker = useWasmWorker()
  const jsWorker = useJsWorker()

  const [datasetName, setDatasetName] = useState("")
  const [rowCount, setRowCount] = useState(0)
  const [goDatasetId, setGoDatasetId] = useState("")
  const [jsDatasetId, setJsDatasetId] = useState("")

  const [epochs, setEpochs] = useState(10000)
  const [learningRate, setLearningRate] = useState(0.01)
  const [benchmarkMode, setBenchmarkMode] = useState("go_favor_u64")
  const [rounds, setRounds] = useState(48)

  const [isUploading, setIsUploading] = useState(false)
  const [isRunningJs, setIsRunningJs] = useState(false)
  const [isRunningGo, setIsRunningGo] = useState(false)
  const [isRunningBoth, setIsRunningBoth] = useState(false)

  const [errorMessage, setErrorMessage] = useState("")
  const [jsResult, setJsResult] = useState(null)
  const [goResult, setGoResult] = useState(null)
  const [jsRoundtripMs, setJsRoundtripMs] = useState(null)
  const [goRoundtripMs, setGoRoundtripMs] = useState(null)
  const [jsEndToEndMs, setJsEndToEndMs] = useState(null)
  const [goEndToEndMs, setGoEndToEndMs] = useState(null)

  const isReady = wasmWorker.isReady && jsWorker.isReady
  const initError = wasmWorker.initError || jsWorker.initError

  const clearResults = () => {
    setJsResult(null)
    setGoResult(null)
    setJsRoundtripMs(null)
    setGoRoundtripMs(null)
    setJsEndToEndMs(null)
    setGoEndToEndMs(null)
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !isReady) return

    setIsUploading(true)
    setErrorMessage("")
    clearResults()

    try {
      const csvText = await file.text()
      const [goResponse, jsResponse] = await Promise.all([
        wasmWorker.postAction("PARSE_CSV", { csvText }),
        jsWorker.postAction("PARSE_CSV", { csvText })
      ])

      setDatasetName(file.name)
      setGoDatasetId(goResponse.data?.id || "")
      setJsDatasetId(jsResponse.data?.id || "")
      setRowCount(Number(goResponse.data?.rowCount || 0))
    } catch (error) {
      setErrorMessage(error.message || "Failed to upload CSV")
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const runJsBenchmark = async () => {
    const endToEndStart = performance.now()

    if (!jsDatasetId) {
      throw new Error("Upload dataset first")
    }

    let benchmark
    if (benchmarkMode === "ml_gd") {
      const page = await jsWorker.postAction("GET_PAGE", {
        datasetId: jsDatasetId,
        offset: 0,
        limit: rowCount
      })
      const datasetRows = page.data?.rows || []

      const startRoundtrip = performance.now()
      benchmark = await jsWorker.postAction("START_ML_BENCHMARK_JS", {
        datasetRows,
        epochs,
        learningRate
      })
      const endRoundtrip = performance.now()
      setJsRoundtripMs(endRoundtrip - startRoundtrip)
    } else {
      const startRoundtrip = performance.now()
      benchmark = await jsWorker.postAction("START_GO_FAVOR_BENCHMARK_JS", {
        datasetId: jsDatasetId,
        rounds
      })
      const endRoundtrip = performance.now()
      setJsRoundtripMs(endRoundtrip - startRoundtrip)
    }

    const endToEndEnd = performance.now()
    setJsResult(benchmark.data || null)
    setJsEndToEndMs(endToEndEnd - endToEndStart)
    return benchmark.data || null
  }

  const runGoBenchmark = async () => {
    const endToEndStart = performance.now()

    if (!goDatasetId) {
      throw new Error("Upload dataset first")
    }

    let benchmark
    if (benchmarkMode === "ml_gd") {
      const page = await wasmWorker.postAction("GET_PAGE", {
        datasetId: goDatasetId,
        offset: 0,
        limit: rowCount
      })

      const datasetRows = page.data?.rows || []
      const startRoundtrip = performance.now()
      benchmark = await wasmWorker.postAction("START_ML_BENCHMARK_GO", {
        datasetRows,
        epochs,
        learningRate
      })
      const endRoundtrip = performance.now()
      setGoRoundtripMs(endRoundtrip - startRoundtrip)
    } else {
      const startRoundtrip = performance.now()
      benchmark = await wasmWorker.postAction("START_GO_FAVOR_BENCHMARK_GO", {
        datasetId: goDatasetId,
        rounds
      })
      const endRoundtrip = performance.now()
      setGoRoundtripMs(endRoundtrip - startRoundtrip)
    }

    const endToEndEnd = performance.now()

    setGoResult(benchmark.data || null)
    setGoEndToEndMs(endToEndEnd - endToEndStart)
    return benchmark.data || null
  }

  const handleRunJs = async () => {
    setIsRunningJs(true)
    setErrorMessage("")

    try {
      await runJsBenchmark()
    } catch (error) {
      setErrorMessage(error.message || "JS benchmark failed")
    } finally {
      setIsRunningJs(false)
    }
  }

  const handleRunGo = async () => {
    setIsRunningGo(true)
    setErrorMessage("")

    try {
      await runGoBenchmark()
    } catch (error) {
      setErrorMessage(error.message || "Go benchmark failed")
    } finally {
      setIsRunningGo(false)
    }
  }

  const handleRunBoth = async () => {
    setIsRunningBoth(true)
    setErrorMessage("")

    try {
      await Promise.all([runJsBenchmark(), runGoBenchmark()])
    } catch (error) {
      setErrorMessage(error.message || "Combined benchmark failed")
    } finally {
      setIsRunningBoth(false)
    }
  }

  const canRun = Boolean(rowCount > 0 && jsDatasetId && goDatasetId && isReady)
  const isBusy = isUploading || isRunningJs || isRunningGo || isRunningBoth

  return (
    <div>
      <h2>Go vs JavaScript Benchmark Compare</h2>
      <p style={{ marginBottom: "14px", color: "#2c3e50" }}>
        Upload one CSV once, then run the same task independently in each engine.
      </p>

      <div className="dataset-controls">
        <div className="flex-row" style={{ justifyContent: "space-between" }}>
          <div>
            <label>Upload CSV</label>
            <input type="file" accept=".csv" onChange={handleUpload} disabled={!isReady || isBusy} />
          </div>

          <div style={{ minWidth: "220px", textAlign: "right" }}>
            <p><strong>File:</strong> {datasetName || "-"}</p>
            <p><strong>Rows:</strong> {rowCount || 0}</p>
          </div>
        </div>

        <div className="flex-row" style={{ marginTop: "16px" }}>
          <label>Benchmark Task</label>
          <select
            value={benchmarkMode}
            onChange={(e) => {
              setBenchmarkMode(e.target.value)
              clearResults()
            }}
            disabled={isBusy}
          >
            <option value="go_favor_u64">U64 Feature Hash (Go-favor)</option>
            <option value="ml_gd">Linear Regression GD</option>
          </select>

          <label>Epochs</label>
          <input
            type="text"
            value={epochs}
            onChange={(e) => setEpochs(Math.max(1, Number(e.target.value) || 1))}
            disabled={isBusy || benchmarkMode !== "ml_gd"}
            style={{ width: "120px" }}
          />

          <label>Learning Rate</label>
          <input
            type="text"
            value={learningRate}
            onChange={(e) => setLearningRate(Math.max(0.000001, Number(e.target.value) || 0.01))}
            disabled={isBusy || benchmarkMode !== "ml_gd"}
            style={{ width: "120px" }}
          />

          <label>Rounds</label>
          <input
            type="text"
            value={rounds}
            onChange={(e) => setRounds(Math.max(1, Number(e.target.value) || 1))}
            disabled={isBusy || benchmarkMode !== "go_favor_u64"}
            style={{ width: "100px" }}
          />

          <button type="button" onClick={handleRunJs} disabled={!canRun || isBusy}>Run JS Only</button>
          <button type="button" onClick={handleRunGo} disabled={!canRun || isBusy}>Run Go WASM Only</button>
          <button type="button" onClick={handleRunBoth} disabled={!canRun || isBusy}>Run Both</button>
        </div>
      </div>

      {!isReady && !initError && <div className="status-message status-info">Initializing workers...</div>}
      {isUploading && <div className="status-message status-info">Parsing CSV in both workers...</div>}
      {(isRunningJs || isRunningGo || isRunningBoth) && (
        <div className="status-message status-info">Running benchmark...</div>
      )}
      {(initError || errorMessage) && <div className="status-message status-error">{initError || errorMessage}</div>}

      <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
        <div className="filter-panel">
          <h3>JavaScript Result</h3>
          <p><strong>Worker Compute:</strong> {jsResult?.timingsMs?.js != null ? `${jsResult.timingsMs.js.toFixed(2)} ms` : "-"}</p>
          <p><strong>Round-trip:</strong> {jsRoundtripMs != null ? `${jsRoundtripMs.toFixed(2)} ms` : "-"}</p>
          <p><strong>End-to-end:</strong> {jsEndToEndMs != null ? `${jsEndToEndMs.toFixed(2)} ms` : "-"}</p>
          {benchmarkMode === "ml_gd" ? (
            <>
              <p><strong>m:</strong> {jsResult?.jsModel?.m != null ? Number(jsResult.jsModel.m).toFixed(8) : "-"}</p>
              <p><strong>b:</strong> {jsResult?.jsModel?.b != null ? Number(jsResult.jsModel.b).toFixed(8) : "-"}</p>
            </>
          ) : (
            <p><strong>Checksum:</strong> {jsResult?.checksum || "-"}</p>
          )}
        </div>

        <div className="filter-panel">
          <h3>Go WASM Result</h3>
          <p><strong>Worker Compute:</strong> {goResult?.timingsMs?.wasm != null ? `${goResult.timingsMs.wasm.toFixed(2)} ms` : "-"}</p>
          <p><strong>Round-trip:</strong> {goRoundtripMs != null ? `${goRoundtripMs.toFixed(2)} ms` : "-"}</p>
          <p><strong>End-to-end:</strong> {goEndToEndMs != null ? `${goEndToEndMs.toFixed(2)} ms` : "-"}</p>
          {benchmarkMode === "ml_gd" ? (
            <>
              <p><strong>m:</strong> {goResult?.wasmModel?.m != null ? Number(goResult.wasmModel.m).toFixed(8) : "-"}</p>
              <p><strong>b:</strong> {goResult?.wasmModel?.b != null ? Number(goResult.wasmModel.b).toFixed(8) : "-"}</p>
            </>
          ) : (
            <p><strong>Checksum:</strong> {goResult?.checksum || "-"}</p>
          )}
        </div>
      </div>

      {benchmarkMode === "ml_gd" && jsResult?.jsModel && goResult?.wasmModel && (
        <div style={{ marginTop: "14px", padding: "12px 16px", background: "#f0f4ff", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "13px", color: "#2c3e50" }}>
          <strong>Model Delta:</strong> Δm {Math.abs(jsResult.jsModel.m - goResult.wasmModel.m).toExponential(3)} | Δb {Math.abs(jsResult.jsModel.b - goResult.wasmModel.b).toExponential(3)}
        </div>
      )}

      {benchmarkMode === "go_favor_u64" && jsResult?.checksum && goResult?.checksum && (
        <div style={{ marginTop: "14px", padding: "12px 16px", background: "#f0f4ff", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "13px", color: "#2c3e50" }}>
          <strong>Checksum Match:</strong> {jsResult.checksum === goResult.checksum ? "Yes" : "No"}
        </div>
      )}
    </div>
  )
}
