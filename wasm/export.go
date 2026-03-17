package main

import (
	"bytes"
	"encoding/csv"
	"syscall/js"
)

// ExportCSV: JS call: exportCSV(datasetID)
func ExportCSV(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "dataset id required"}
	}

	id := args[0].String()
	data, ok := datasets[id]
	if !ok {
		return map[string]any{"error": "dataset not found"}
	}

	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)

	// Write Headers
	writer.Write(data.Columns)

	// Write Rows
	for _, row := range data.Rows {
		var rowSlice []string
		for _, col := range data.Columns {
			val, _ := row[col].(string)
			rowSlice = append(rowSlice, val)
		}
		writer.Write(rowSlice)
	}

	writer.Flush()

	return buffer.String() // Returns the fully generated CSV string
}
