export default function ExportPanel({
  columns,
  exportColumns,
  isBusy,
  onToggleColumn,
  onToggleAll,
  onExport
}) {
  return (
    <div className="export-panel" style={{ display: "inline-block", maxWidth: "100%", overflowX: "auto" }}>
      <h3>Export Settings</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "15px" }}>
        <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
          <input
            type="checkbox"
            checked={columns.length > 0 && columns.every(col => exportColumns[col])}
            onChange={onToggleAll}
            disabled={isBusy}
            style={{ marginRight: "6px", cursor: "pointer" }}
          />
          All Fields
        </label>

        <span style={{ borderLeft: "1px solid #cbd5e0" }}></span>

        {columns.map((col) => (
          <label key={col} style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={!!exportColumns[col]}
              onChange={() => onToggleColumn(col)}
              disabled={isBusy}
              style={{ marginRight: "6px", cursor: "pointer" }}
            />
            {col}
          </label>
        ))}
      </div>

      <button
        onClick={onExport}
        disabled={isBusy}
      >
        Export to CSV
      </button>
    </div>
  )
}
