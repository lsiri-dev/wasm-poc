import { useMemo, useState } from "react"
import { useWasmWorker } from "../hooks/useWasmWorker"
import { useJsWorker } from "../hooks/useJsWorker"
import { useRustWorker } from "../hooks/useRustWorker"
import DatasetControls from "./csv/DatasetControls"
import FilterPanel from "./csv/FilterPanel"
import ExportPanel from "./csv/ExportPanel"
import DataTable from "./csv/DataTable"
import PaginationAndMetrics from "./csv/PaginationAndMetrics"
import { operatorOptions } from "./csv/constants"

function buildNewRule(columns) {
  return {
    column: columns[0] || "",
    operator: "eq",
    value: "",
    logic: "and"
  }
}

function normalizeMeta(payload) {
  return {
    id: payload?.id || null,
    columns: payload?.columns || [],
    rowCount: payload?.rowCount || 0,
    parseTimeMs: payload?.parseTimeMs
  }
}

function normalizeFloat64Array(values) {
  if (values.length === 0) {
    return new Float64Array(0)
  }

  let min = values[0]
  let max = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i]
    if (value < min) min = value
    if (value > max) max = value
  }

  const normalized = new Float64Array(values.length)
  const range = max - min
  if (range === 0) {
    return normalized
  }

  for (let i = 0; i < values.length; i += 1) {
    normalized[i] = (values[i] - min) / range
  }

  return normalized
}

function prepareMLBenchmarkData(datasetRows = []) {
  const experienceRaw = new Float64Array(datasetRows.length)
  const salaryRaw = new Float64Array(datasetRows.length)

  for (let i = 0; i < datasetRows.length; i += 1) {
    const row = datasetRows[i] || {}
    const experience = Number(row.experience)
    const salary = Number(row.salary_usd)

    experienceRaw[i] = Number.isFinite(experience) ? experience : 0
    salaryRaw[i] = Number.isFinite(salary) ? salary : 0
  }

  return {
    experienceArr: normalizeFloat64Array(experienceRaw),
    salaryArr: normalizeFloat64Array(salaryRaw)
  }
}

export default function CSVUploader() {
  const [engine, setEngine] = useState("wasm")
  const wasmWorker = useWasmWorker()
  const jsWorker = useJsWorker()
  const rustWorker = useRustWorker()
  const { isReady, initError, postAction } = engine === "wasm" ? wasmWorker : (engine === "js" ? jsWorker : rustWorker)

  const [datasetId, setDatasetId] = useState(null)
  const [datasetIds, setDatasetIds] = useState([])
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [rowCount, setRowCount] = useState(0)

  const [sortRules, setSortRules] = useState([])
  const [filterRules, setFilterRules] = useState([])
  const [exportColumns, setExportColumns] = useState({})

  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(200)

  const [isUploading, setIsUploading] = useState(false)
  const [isPaging, setIsPaging] = useState(false)
  const [isSorting, setIsSorting] = useState(false)
  const [isFiltering, setIsFiltering] = useState(false)
  const [isBenchmarking, setIsBenchmarking] = useState(false)

  const [errorMessage, setErrorMessage] = useState("")
  const [timings, setTimings] = useState({ parseMs: null, sortMs: null, filterMs: null })
  const [timingDetails, setTimingDetails] = useState({ parse: null, sort: null, filter: null })
  const [mlBenchmark, setMlBenchmark] = useState(null)

  const totalPages = useMemo(() => Math.max(1, Math.ceil((rowCount || 0) / rowsPerPage)), [rowCount, rowsPerPage])
  const isBusy = !isReady || isUploading || isPaging || isSorting || isFiltering || isBenchmarking

  const initializeExportColumns = (nextColumns) => {
    const initialExportCols = {}
    nextColumns.forEach((col) => {
      initialExportCols[col] = true
    })
    setExportColumns(initialExportCols)
  }

  const refreshDatasetIds = async () => {
    const response = await postAction("LIST_DATASETS")
    setDatasetIds(Array.isArray(response.data) ? response.data : [])
  }

  const loadPage = async (nextPage, overrideDatasetId, overrideRowsPerPage) => {
    const targetDatasetId = overrideDatasetId || datasetId
    const targetPageSize = overrideRowsPerPage || rowsPerPage
    if (!targetDatasetId) return

    const safePage = Math.max(1, nextPage)
    const offset = (safePage - 1) * targetPageSize

    setIsPaging(true)
    setErrorMessage("")

    try {
      const response = await postAction("GET_PAGE", {
        datasetId: targetDatasetId,
        offset,
        limit: targetPageSize
      })

      const payload = response.data || {}
      setRows(payload.rows || [])
      setColumns(payload.columns || [])
      setRowCount(payload.rowCount || 0)
      setCurrentPage(safePage)
    } catch (error) {
      setErrorMessage(error.message || "Failed to load page")
    } finally {
      setIsPaging(false)
    }
  }

  const applyMetadata = (payload) => {
    const meta = normalizeMeta(payload)
    setDatasetId(meta.id)
    setColumns(meta.columns)
    setRowCount(meta.rowCount)

    if (meta.parseTimeMs != null) {
      setTimings(prev => ({ ...prev, parseMs: Number(meta.parseTimeMs) }))
    }

    return meta
  }

  const handleUpload = async (event) => {
    if (!isReady) return
    const file = event.target.files[0]
    if (!file) return

    setIsUploading(true)
    setErrorMessage("")

    try {
      const csvText = await file.text()
      const response = await postAction("PARSE_CSV", { csvText })
      const meta = applyMetadata(response.data)
      setTimingDetails(prev => ({ ...prev, parse: response.timingBreakdown || null }))

      setSortRules([])
      const initialRules = buildNewRule(meta.columns)
      setFilterRules(initialRules.column ? [initialRules] : [])
      initializeExportColumns(meta.columns)

      await refreshDatasetIds()
      await loadPage(1, meta.id)
    } catch (error) {
      setErrorMessage(error.message || "Failed to parse CSV")
    } finally {
      setIsUploading(false)
      event.target.value = null
    }
  }

  const handleDatasetSelect = async (id) => {
    if (!isReady || !id) return

    setErrorMessage("")
    try {
      const response = await postAction("GET_DATASET", { datasetId: id })
      const meta = applyMetadata(response.data)

      setSortRules([])
      const initialRules = buildNewRule(meta.columns)
      setFilterRules(initialRules.column ? [initialRules] : [])
      initializeExportColumns(meta.columns)

      await loadPage(1, id)
    } catch (error) {
      setErrorMessage(error.message || "Failed to load dataset")
    }
  }

  const handleDeleteDataset = async () => {
    if (!isReady || !datasetId) return

    const shouldDelete = window.confirm(`Delete ${datasetId}?`)
    if (!shouldDelete) return

    setErrorMessage("")

    try {
      await postAction("DELETE_DATASET", { datasetId })
      await refreshDatasetIds()

      const remaining = datasetIds.filter((id) => id !== datasetId)
      if (remaining.length === 0) {
        setDatasetId(null)
        setColumns([])
        setRows([])
        setRowCount(0)
        setSortRules([])
        setFilterRules([])
        setExportColumns({})
        setCurrentPage(1)
        return
      }

      await handleDatasetSelect(remaining[0])
    } catch (error) {
      setErrorMessage(error.message || "Failed to delete dataset")
    }
  }

  const applyFilters = async (rules) => {
    if (!datasetId) return

    setIsFiltering(true)
    setErrorMessage("")

    try {
      const cleanRules = rules.filter(rule => rule.column && rule.operator)
      const response = await postAction("FILTER", {
        datasetId,
        rules: cleanRules
      })

      const meta = applyMetadata(response.data)
      setTimings(prev => ({ ...prev, filterMs: response.executionMs ?? null }))
      setTimingDetails(prev => ({ ...prev, filter: response.timingBreakdown || null }))
      await loadPage(1, meta.id)
    } catch (error) {
      setErrorMessage(error.message || "Filter failed")
    } finally {
      setIsFiltering(false)
    }
  }

  const handleSort = async (columnName, event) => {
    if (!datasetId) return

    setIsSorting(true)
    setErrorMessage("")

    try {
      const isShiftPressed = event.shiftKey
      let newRules = [...sortRules]
      const existingIndex = newRules.findIndex(rule => rule.column === columnName)

      if (!isShiftPressed) {
        if (existingIndex >= 0) {
          const currentDir = newRules[existingIndex].dir
          newRules = [{ column: columnName, dir: currentDir === "asc" ? "desc" : "asc" }]
        } else {
          newRules = [{ column: columnName, dir: "asc" }]
        }
      } else {
        if (existingIndex >= 0) {
          if (newRules[existingIndex].dir === "asc") {
            newRules[existingIndex].dir = "desc"
          } else {
            newRules.splice(existingIndex, 1)
          }
        } else {
          newRules.push({ column: columnName, dir: "asc" })
        }
      }

      setSortRules(newRules)

      const response = await postAction("SORT", {
        datasetId,
        rules: newRules
      })

      applyMetadata(response.data)
      setTimings(prev => ({ ...prev, sortMs: response.executionMs ?? null }))
      setTimingDetails(prev => ({ ...prev, sort: response.timingBreakdown || null }))
      await loadPage(1, datasetId)
    } catch (error) {
      setErrorMessage(error.message || "Sort failed")
    } finally {
      setIsSorting(false)
    }
  }

  const updateRule = (index, key, value) => {
    setFilterRules((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        [key]: value
      }
      return next
    })
  }

  const addRule = () => {
    if (columns.length === 0) return
    setFilterRules((prev) => [
      ...prev,
      {
        column: columns[0],
        operator: "eq",
        value: "",
        logic: "and"
      }
    ])
  }

  const removeRule = (index) => {
    setFilterRules((prev) => prev.filter((_, i) => i !== index))
  }

  const handleApplyFilters = async () => {
    await applyFilters(filterRules)
  }

  const handleResetFilters = async () => {
    const initialRule = buildNewRule(columns)
    const nextRules = initialRule.column ? [initialRule] : []
    setFilterRules(nextRules)
    await applyFilters([])
  }

  const toggleExportColumn = (columnName) => {
    setExportColumns((prev) => ({
      ...prev,
      [columnName]: !prev[columnName]
    }))
  }

  const toggleAllExportColumns = () => {
    const allSelected = columns.length > 0 && columns.every(col => exportColumns[col])
    const next = {}
    columns.forEach((col) => {
      next[col] = !allSelected
    })
    setExportColumns(next)
  }

  const handleExport = async () => {
    if (!datasetId) return

    setErrorMessage("")
    const colsToExport = columns.filter(col => exportColumns[col])

    if (colsToExport.length === 0) {
      window.alert("Please select at least one column to export.")
      return
    }

    try {
      const response = await postAction("EXPORT", {
        datasetId,
        columns: colsToExport
      })

      const csvString = String(response.data || "")
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.setAttribute("download", `exported_${datasetId}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      setErrorMessage(error.message || "Export failed")
    }
  }

  const handleRowsPerPageChange = async (nextSize) => {
    setRowsPerPage(nextSize)
    await loadPage(1, datasetId, nextSize)
  }

  const handleRunMlBenchmark = async () => {
    if (!datasetId || engine !== "wasm") return

    setIsBenchmarking(true)
    setErrorMessage("")

    try {
      const allRowsResponse = await postAction("GET_PAGE", {
        datasetId,
        offset: 0,
        limit: rowCount
      })

      const datasetRows = allRowsResponse.data?.rows || []
      if (datasetRows.length === 0) {
        throw new Error("No rows available for benchmark")
      }

      const { experienceArr, salaryArr } = prepareMLBenchmarkData(datasetRows)

      const benchmarkResponse = await postAction(
        "START_ML_BENCHMARK",
        {
          experienceArr,
          salaryArr,
          epochs: 10000,
          learningRate: 0.01
        },
        [experienceArr.buffer, salaryArr.buffer]
      )

      setMlBenchmark(benchmarkResponse.data || null)
    } catch (error) {
      setErrorMessage(error.message || "ML benchmark failed")
    } finally {
      setIsBenchmarking(false)
    }
  }

  const handlePrevPage = async () => {
    if (currentPage <= 1) return
    await loadPage(currentPage - 1)
  }

  const handleNextPage = async () => {
    if (currentPage >= totalPages) return
    await loadPage(currentPage + 1)
  }

  return (
    <div>
      <h2>Upload CSV</h2>

      <div style={{ display: "flex", alignItems: "center", marginBottom: "20px", padding: "10px", backgroundColor: "#f0f8ff", borderRadius: "5px", border: "1px solid #cce5ff" }}>
        <h3 style={{ margin: "0 15px 0 0", fontSize: "16px" }}>Engine:</h3>
        <label style={{ marginRight: "15px", cursor: "pointer", fontWeight: engine === "wasm" ? "bold" : "normal", color: "black" }}>
          <input 
            type="radio" 
            name="engine" 
            value="wasm" 
            checked={engine === "wasm"} 
            onChange={(e) => setEngine(e.target.value)} 
            disabled={isBusy}
            style={{ marginRight: "5px" }}
          /> 
          WebAssembly (Go)
        </label>
        <label style={{ marginRight: "15px", cursor: "pointer", fontWeight: engine === "rust" ? "bold" : "normal", color: "black" }}>
          <input 
            type="radio" 
            name="engine" 
            value="rust" 
            checked={engine === "rust"} 
            onChange={(e) => setEngine(e.target.value)} 
            disabled={isBusy}
            style={{ marginRight: "5px" }}
          /> 
          WebAssembly (Rust)
        </label>
        <label style={{ cursor: "pointer", fontWeight: engine === "js" ? "bold" : "normal", color: "black" }}>
          <input 
            type="radio" 
            name="engine" 
            value="js" 
            checked={engine === "js"} 
            onChange={(e) => setEngine(e.target.value)} 
            disabled={isBusy}
            style={{ marginRight: "5px" }}
          /> 
          JavaScript
        </label>
      </div>
      
      <DatasetControls
        datasetId={datasetId}
        datasetIds={datasetIds}
        isBusy={isBusy}
        onUpload={handleUpload}
        onSelect={handleDatasetSelect}
        onDelete={handleDeleteDataset}
      />

      {!isReady && !initError && (
        <div className="status-message status-info">
          Initializing WASM worker...
        </div>
      )}

      {isUploading && (
        <div className="status-message status-info">
          Processing CSV in Web Worker... Please wait.
        </div>
      )}

      {(initError || errorMessage) && (
        <div className="status-message status-error">
          {initError || errorMessage}
        </div>
      )}

      {datasetId && columns.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          {isSorting && (
            <div className="status-message status-error" style={{ marginBottom: "15px" }}>
              Sorting in Web Worker...
            </div>
          )}
          {isFiltering && (
            <div className="status-message status-info" style={{ marginBottom: "15px" }}>
              Filtering in Web Worker...
            </div>
          )}
          {isBenchmarking && (
            <div className="status-message status-info" style={{ marginBottom: "15px" }}>
              Running ML benchmark (JS vs WASM) for 10,000 epochs...
            </div>
          )}

          <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleRunMlBenchmark}
              disabled={isBusy || engine !== "wasm" || !datasetId}
            >
              Run ML Benchmark (10,000 epochs)
            </button>
            {engine !== "wasm" && (
              <span style={{ color: "#718096", fontSize: "13px" }}>
                Switch engine to WebAssembly (Go) to run this benchmark.
              </span>
            )}
          </div>

          {mlBenchmark && (
            <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f0f4ff", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "13px", color: "#2c3e50" }}>
              <strong>ML Benchmark:</strong> JS <strong>{mlBenchmark.timingsMs?.js?.toFixed(2)} ms</strong> | WASM <strong>{mlBenchmark.timingsMs?.wasm?.toFixed(2)} ms</strong> |
              JS m/b <strong>{Number(mlBenchmark.jsModel?.m || 0).toFixed(8)}</strong> / <strong>{Number(mlBenchmark.jsModel?.b || 0).toFixed(8)}</strong> |
              WASM m/b <strong>{Number(mlBenchmark.wasmModel?.m || 0).toFixed(8)}</strong> / <strong>{Number(mlBenchmark.wasmModel?.b || 0).toFixed(8)}</strong> |
              Δm <strong>{Number(mlBenchmark.deltas?.m || 0).toExponential(3)}</strong>, Δb <strong>{Number(mlBenchmark.deltas?.b || 0).toExponential(3)}</strong>
            </div>
          )}

          <FilterPanel
            columns={columns}
            filterRules={filterRules}
            operatorOptions={operatorOptions}
            isBusy={isBusy}
            onUpdateRule={updateRule}
            onAddRule={addRule}
            onRemoveRule={removeRule}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
          />

          <ExportPanel
            columns={columns}
            exportColumns={exportColumns}
            isBusy={isBusy}
            onToggleColumn={toggleExportColumn}
            onToggleAll={toggleAllExportColumns}
            onExport={handleExport}
          />

          <PaginationAndMetrics
            datasetId={datasetId}
            currentPage={currentPage}
            totalPages={totalPages}
            rowsPerPage={rowsPerPage}
            totalRows={rowCount}
            timings={timings}
            timingDetails={timingDetails}
            isBusy={isBusy}
            onRowsPerPageChange={handleRowsPerPageChange}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />

          <DataTable
            columns={columns}
            rows={rows}
            sortRules={sortRules}
            isBusy={isBusy}
            onSort={handleSort}
          />
        </div>
      )}
    </div>
  )
}
