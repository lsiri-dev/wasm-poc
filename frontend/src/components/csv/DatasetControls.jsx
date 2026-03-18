export default function DatasetControls({
  datasetId,
  datasetIds,
  isBusy,
  onUpload,
  onSelect,
  onDelete
}) {
  return (
    <>
      <h2>Upload CSV</h2>
      <input type="file" accept=".csv" onChange={onUpload} disabled={isBusy} />

      <div className="flex-row">
        <label>Active Dataset:</label>
        <select
          value={datasetId || ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={datasetIds.length === 0 || isBusy}
          style={{ minWidth: "200px" }}
        >
          {datasetIds.length === 0 && <option value="">No datasets loaded</option>}
          {datasetIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>

        <button
          onClick={onDelete}
          disabled={!datasetId || isBusy}
        >
          Delete Dataset
        </button>
      </div>
    </>
  )
}
