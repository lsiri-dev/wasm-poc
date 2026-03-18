import { pageSizeOptions } from "./constants"

export default function PaginationAndMetrics({
  datasetId,
  currentPage,
  totalPages,
  rowsPerPage,
  totalRows,
  timings,
  isBusy,
  onRowsPerPageChange,
  onPrevPage,
  onNextPage
}) {
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1
  const rangeEnd = Math.min(currentPage * rowsPerPage, totalRows)

  return (
    <>
      <div style={{ marginTop: "20px", padding: "16px", background: "white", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <p style={{ margin: "0 0 8px 0", color: "#2c3e50", fontWeight: "500" }}>
          Showing rows <strong>{rangeStart}</strong> - <strong>{rangeEnd}</strong> of <strong>{totalRows}</strong> from <strong>{datasetId || "-"}</strong>
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: "#718096" }}>
          Click a header to sort. Hold <strong>Shift + Click</strong> for multi-column sort.
        </p>
      </div>

      <div style={{ marginTop: "12px", padding: "12px 16px", background: "#f0f4ff", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "13px", color: "#2c3e50" }}>
        <strong>Benchmarks:</strong> Parse: <strong>{timings.parseMs != null ? `${timings.parseMs.toFixed(2)} ms` : "-"}</strong> | Sort: <strong>{timings.sortMs != null ? `${timings.sortMs.toFixed(2)} ms` : "-"}</strong> | Filter: <strong>{timings.filterMs != null ? `${timings.filterMs.toFixed(2)} ms` : "-"}</strong>
      </div>

      <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "14px", fontWeight: "600" }}>Rows per page:</label>
        <select
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
          disabled={isBusy}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>

        <button
          onClick={onPrevPage}
          disabled={isBusy || currentPage === 1}
        >
          ← Prev
        </button>

        <span style={{ fontSize: "14px", fontWeight: "500", minWidth: "100px", textAlign: "center" }}>Page <strong>{currentPage}</strong> / <strong>{totalPages}</strong></span>

        <button
          onClick={onNextPage}
          disabled={isBusy || currentPage === totalPages}
        >
          Next →
        </button>
      </div>
    </>
  )
}
