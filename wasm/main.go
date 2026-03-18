package main

import (
	"encoding/csv"
	"fmt"
	"strings"
	"syscall/js"
	"time"
)

type SessionData struct {
	Columns  []string
	BaseRows []map[string]any
	Rows     []map[string]any
}

var datasets = make(map[string]SessionData)

func main() {
	fmt.Println("WASM Engine: Parser & Store Loaded")
	js.Global().Set("parseCSV", js.FuncOf(ParseCSV))
	js.Global().Set("getDataset", js.FuncOf(GetDataset))
	js.Global().Set("getPage", js.FuncOf(GetPage))
	js.Global().Set("deleteDataset", js.FuncOf(DeleteDataset))
	js.Global().Set("listDatasets", js.FuncOf(ListDatasets))
	js.Global().Set("filterDataset", js.FuncOf(FilterDataset))
	js.Global().Set("sortDataset", js.FuncOf(SortDataset))
	js.Global().Set("exportCSV", js.FuncOf(ExportCSV))
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
	reader.FieldsPerRecord = -1 // Allow variable number of fields
	reader.LazyQuotes = true

	records, err := reader.ReadAll()
	if err != nil {
		return map[string]any{"error": "Parsing failed: " + err.Error()}
	}

	if len(records) == 0 {
		return map[string]any{"error": "Empty CSV"}
	}

	rawHeaders := records[0]
	var headers []string
	var headerIndices []int

	// Clean headers and ignore empty columns
	for i, h := range rawHeaders {
		trimH := strings.TrimSpace(h)
		if trimH != "" {
			headers = append(headers, trimH)
			headerIndices = append(headerIndices, i)
		}
	}

	if len(headers) == 0 {
		return map[string]any{"error": "No valid headers found"}
	}

	var structuredRows []map[string]any

	for _, record := range records[1:] {
		// Check if row is completely empty
		isEmptyRow := true
		for _, val := range record {
			if strings.TrimSpace(val) != "" {
				isEmptyRow = false
				break
			}
		}
		if isEmptyRow {
			continue
		}

		rowMap := make(map[string]any)
		for hIdx, colIdx := range headerIndices {
			if colIdx < len(record) {
				rowMap[headers[hIdx]] = strings.TrimSpace(record[colIdx])
			} else {
				rowMap[headers[hIdx]] = ""
			}
		}
		structuredRows = append(structuredRows, rowMap)
	}

	baseRows := append([]map[string]any(nil), structuredRows...)

	datasetID := fmt.Sprintf("dataset_%d", len(datasets)+1)
	datasets[datasetID] = SessionData{
		Columns:  headers,
		BaseRows: baseRows,
		Rows:     structuredRows,
	}

	// Calculate duration
	duration := time.Since(startTime)

	fmt.Printf("⏱️ PROCESSED: %d rows in %v\n", len(structuredRows), duration)

	return map[string]any{
		"id":          datasetID,
		"columns":     convertToAnySlice(headers),
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
