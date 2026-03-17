import React, { useState } from "react"

export default function CSVUploader() {
  const [datasetId, setDatasetId] = useState(null)
  const [dataset, setDataset] = useState(null)
  const [sortRules, setSortRules] = useState([]) // Array of { column, dir }
  const [exportColumns, setExportColumns] = useState({}) // Object mapping column name to boolean

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const text = await file.text()
    
    // Call the parseCSV function exported directly by WebAssembly (from main.go)
    const result = window.parseCSV(text)
    if (result && !result.error) {
      setDatasetId(result.id)
      setDataset(result)
      setSortRules([])
      
      // Initialize all columns as selected for export
      const initialExportCols = {}
      result.columns.forEach(col => {
        initialExportCols[col] = true
      })
      setExportColumns(initialExportCols)
    } else {
      console.error("Parse error:", result.error)
    }
  }

  const handleSort = (columnName, e) => {
    if (!datasetId) return
    
    const isShiftPressed = e.shiftKey;
    let newRules = [...sortRules];
    const existingIndex = newRules.findIndex(r => r.column === columnName);

    if (!isShiftPressed) {
        // Single column sort mode
        if (existingIndex >= 0) {
            const currentDir = newRules[existingIndex].dir;
            newRules = [{ column: columnName, dir: currentDir === "asc" ? "desc" : "asc" }];
        } else {
            newRules = [{ column: columnName, dir: "asc" }];
        }
    } else {
        // Multi column sort mode
        if (existingIndex >= 0) {
            // Cycle asc -> desc -> remove
            if (newRules[existingIndex].dir === "asc") {
                newRules[existingIndex].dir = "desc";
            } else {
                newRules.splice(existingIndex, 1);
            }
        } else {
            newRules.push({ column: columnName, dir: "asc" });
        }
    }

    setSortRules(newRules);
    
    // Call the sortDataset WebAssembly function with multi-column rules array converted to JSON
    const sortedResult = window.sortDataset(datasetId, JSON.stringify(newRules))
    if (sortedResult && !sortedResult.error) {
      setDataset(sortedResult)
    } else {
      console.error("Sort error:", sortedResult?.error)
    }
  }

  const toggleExportColumn = (columnName) => {
    setExportColumns(prev => ({
      ...prev,
      [columnName]: !prev[columnName]
    }))
  }

  const toggleAllExportColumns = () => {
    const allSelected = dataset.columns.every(col => exportColumns[col])
    const newExportCols = {}
    dataset.columns.forEach(col => {
      newExportCols[col] = !allSelected
    })
    setExportColumns(newExportCols)
  }

  const handleExport = () => {
    if (!datasetId) return
    
    // Generate list of columns to export
    const colsToExport = dataset.columns.filter(col => exportColumns[col])
    
    if (colsToExport.length === 0) {
      alert("Please select at least one column to export.");
      return;
    }

    const colsJSON = JSON.stringify(colsToExport)

    // Call the exportCSV WebAssembly function written in export.go
    const csvString = window.exportCSV(datasetId, colsJSON)

    // Trigger file download in the browser
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", `exported_${datasetId}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getSortIndicator = (columnName) => {
    const index = sortRules.findIndex(r => r.column === columnName);
    if (index === -1) return null;
    const rule = sortRules[index];
    const indicator = rule.dir === "asc" ? "↑" : "↓";
    // Show priority number only if multiple rules are configured
    if (sortRules.length > 1) {
        return ` ${indicator} (${index + 1})`;
    }
    return ` ${indicator}`;
  }

  return (
    <div>
      <h2>Upload CSV</h2>
      <input type="file" accept=".csv" onChange={handleUpload} />
      
      {dataset && (
        <div style={{ marginTop: "20px" }}>
          <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px", marginBottom: "20px", display: "inline-block", maxWidth: "100%", overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 10px 0" }}>Export Settings</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "15px" }}>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}>
                <input 
                  type="checkbox" 
                  checked={dataset.columns.every(col => exportColumns[col])} 
                  onChange={toggleAllExportColumns} 
                  style={{ marginRight: "5px" }}
                />
                All Fields
              </label>
              
              <span style={{ borderLeft: "2px solid #ddd", margin: "0 5px" }}></span>
              
              {dataset.columns.map((col, idx) => (
                <label key={idx} style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
                  <input 
                    type="checkbox" 
                    checked={!!exportColumns[col]} 
                    onChange={() => toggleExportColumn(col)} 
                    style={{ marginRight: "5px" }}
                  />
                  {col}
                </label>
              ))}
            </div>
            
            <button onClick={handleExport} style={{ padding: "8px 16px", cursor: "pointer", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px" }}>
              Export to CSV
            </button>
          </div>

          <div>
            <p style={{ margin: 0 }}>Showing {dataset.rowCount} rows. </p>
            <p style={{ margin: 0, fontSize: "14px", color: "gray" }}>
              <strong>Tip:</strong> Click a header to sort. Hold <strong>Shift + Click</strong> to sort by multiple columns.
            </p>
          </div>
          
          <div style={{ overflowX: "auto", maxHeight: "400px", marginTop: "10px" }}>
            <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead style={{ position: "sticky", top: 0, backgroundColor: "#f1f1f1" }}>
                <tr>
                  {dataset.columns.map((col, idx) => (
                    <th key={idx} onClick={(e) => handleSort(col, e)} style={{ cursor: "pointer", userSelect: "none", color: "black", whiteSpace: "nowrap" }}>
                      {col}
                      <span style={{ color: "blue" }}>{getSortIndicator(col)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {dataset.columns.map((col, colIdx) => (
                      <td key={colIdx} style={{ color: "black", whiteSpace: "nowrap" }}>{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}