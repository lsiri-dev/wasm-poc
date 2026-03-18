function getSortIndicator(columnName, sortRules) {
  const index = sortRules.findIndex(r => r.column === columnName)
  if (index === -1) return null

  const rule = sortRules[index]
  const indicator = rule.dir === "asc" ? "↑" : "↓"
  if (sortRules.length > 1) {
    return ` ${indicator} (${index + 1})`
  }
  return ` ${indicator}`
}

export default function DataTable({ columns, rows, sortRules, isBusy, onSort }) {
  return (
    <div
      style={{
        position: "relative",
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: "650px",
        marginTop: "20px",
        opacity: isBusy ? 0.5 : 1,
        pointerEvents: isBusy ? "none" : "auto",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        background: "white"
      }}
    >
      <table cellPadding="0" cellSpacing="0">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} onClick={(e) => onSort(col, e)} style={{ position: "sticky", top: 0, zIndex: 3, background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)" }}>
                {col}
                <span style={{ color: "#4299e1", marginLeft: "6px" }}>{getSortIndicator(col, sortRules)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {columns.map((col) => (
                <td key={`${rowIdx}-${col}`}>{row[col]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
