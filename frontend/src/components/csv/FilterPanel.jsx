export default function FilterPanel({
  columns,
  filterRules,
  operatorOptions,
  isBusy,
  onUpdateRule,
  onAddRule,
  onRemoveRule,
  onApply,
  onReset
}) {
  return (
    <div className="filter-panel">
      <h3>Filter Rules</h3>

      {filterRules.length === 0 && (
        <p>No filters configured.</p>
      )}

      {filterRules.map((rule, index) => (
        <div
          key={index}
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 1fr 1fr auto",
            gap: "10px",
            marginBottom: "12px",
            alignItems: "center"
          }}
        >
          <select
            value={index === 0 ? "and" : rule.logic}
            onChange={(e) => onUpdateRule(index, "logic", e.target.value)}
            disabled={index === 0 || isBusy}
          >
            <option value="and">AND</option>
            <option value="or">OR</option>
          </select>

          <select
            value={rule.column}
            onChange={(e) => onUpdateRule(index, "column", e.target.value)}
            disabled={isBusy}
          >
            {columns.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>

          <select
            value={rule.operator}
            onChange={(e) => onUpdateRule(index, "operator", e.target.value)}
            disabled={isBusy}
          >
            {operatorOptions.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={rule.value}
            onChange={(e) => onUpdateRule(index, "value", e.target.value)}
            placeholder="Value"
            disabled={isBusy}
          />

          <button
            onClick={() => onRemoveRule(index)}
            disabled={isBusy}
            style={{ padding: "8px 12px" }}
          >
            Remove
          </button>
        </div>
      ))}

      <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button onClick={onAddRule} disabled={isBusy}>Add Rule</button>
        <button onClick={onApply} disabled={isBusy}>Apply Filters</button>
        <button onClick={onReset} disabled={isBusy}>Reset Filters</button>
      </div>
    </div>
  )
}
