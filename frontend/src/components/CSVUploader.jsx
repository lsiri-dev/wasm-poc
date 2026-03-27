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

  const [errorMessage, setErrorMessage] = useState("")
  const [timings, setTimings] = useState({ parseMs: null, sortMs: null, filterMs: null })

  const totalPages = useMemo(() => Math.max(1, Math.ceil((rowCount || 0) / rowsPerPage)), [rowCount, rowsPerPage])
  const isBusy = !isReady || isUploading || isPaging || isSorting || isFiltering

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
      <h2>Select Engine to Use</h2>

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
