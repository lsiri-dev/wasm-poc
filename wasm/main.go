package main

import (
	"encoding/csv"
	"fmt"
	"strings"
	"syscall/js"
	"time"
)

type SessionData struct {
	Columns []string
	Rows    []map[string]any
}

var datasets = make(map[string]SessionData)

func main() {
	fmt.Println("WASM Engine: Parser & Store Loaded")
	js.Global().Set("parseCSV", js.FuncOf(ParseCSV))

	js.Global().Set("getDataset", js.FuncOf(GetDataset))
	js.Global().Set("deleteDataset", js.FuncOf(DeleteDataset))
	js.Global().Set("listDatasets", js.FuncOf(ListDatasets))
	js.Global().Set("filterDataset", js.FuncOf(FilterDataset))
	fmt.Println("Dataset Manager Loaded")
	select {}
}

func ParseCSV(this js.Value, args []js.Value) any {
	startTime := time.Now()

	if len(args) < 1 {
		return map[string]any{"error": "No CSV data provided"}
	}

	csvRaw := args[0].String()
	reader := csv.NewReader(strings.NewReader(csvRaw))

	records, err := reader.ReadAll()
	if err != nil {
		return map[string]any{"error": "Parsing failed: " + err.Error()}
	}

	if len(records) == 0 {
		return map[string]any{"error": "Empty CSV"}
	}

	headers := records[0]
	var structuredRows []map[string]any
	var jsRows []any

	for _, record := range records[1:] {
		rowMap := make(map[string]any)
		for i, val := range record {
			if i < len(headers) {
				rowMap[headers[i]] = val
			}
		}
		structuredRows = append(structuredRows, rowMap)
		jsRows = append(jsRows, rowMap)
	}

	datasetID := fmt.Sprintf("dataset_%d", len(datasets)+1)
	datasets[datasetID] = SessionData{
		Columns: headers,
		Rows:    structuredRows,
	}

	// Calculate duration
	duration := time.Since(startTime)

	fmt.Printf("⏱️ PROCESSED: %d rows in %v\n", len(structuredRows), duration)

	return map[string]any{
		"id":          datasetID,
		"columns":     convertToAnySlice(headers),
		"rows":        jsRows,
		"parseTimeMs": duration.Milliseconds(),
		"rowCount":    len(structuredRows),
	}
}

func convertToAnySlice(in []string) []any {
	out := make([]any, len(in))
	for i, v := range in {
		out[i] = v
	}
	return out
}
