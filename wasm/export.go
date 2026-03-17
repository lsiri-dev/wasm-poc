package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"syscall/js"
)

// ExportCSV: JS call: exportCSV(datasetID, [columnsJSON])
func ExportCSV(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "dataset id required"}
	}

	id := args[0].String()
	data, ok := datasets[id]
	if !ok {
		return map[string]any{"error": "dataset not found"}
	}

	exportColumns := data.Columns
	if len(args) > 1 {
		colsJSON := args[1].String()
		if colsJSON != "" {
			var parsedCols []string
			if err := json.Unmarshal([]byte(colsJSON), &parsedCols); err == nil && len(parsedCols) > 0 {
				exportColumns = parsedCols
			}
		}
	}

	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)

	// Write Headers
	writer.Write(exportColumns)

	// Write Rows
	for _, row := range data.Rows {
		var rowSlice []string
		for _, col := range exportColumns {
			val, _ := row[col].(string)
			rowSlice = append(rowSlice, val)
		}
		writer.Write(rowSlice)
	}

	writer.Flush()

	return buffer.String() // Returns the fully generated CSV string
}
