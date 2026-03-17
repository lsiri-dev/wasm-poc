package main

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"syscall/js"
)

type SortRule struct {
	Column string `json:"column"`
	Dir    string `json:"dir"` // "asc" or "desc"
}

// SortDataset: JS call: sortDataset(datasetID, rulesJSON)
func SortDataset(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return map[string]any{"error": "usage: sortDataset(datasetID, rulesJSON)"}
	}

	id := args[0].String()
	rulesJSON := args[1].String()

	var rules []SortRule
	if err := json.Unmarshal([]byte(rulesJSON), &rules); err != nil {
		return map[string]any{"error": "invalid rules JSON: " + err.Error()}
	}

	data, ok := datasets[id]
	if !ok {
		return map[string]any{"error": "dataset not found"}
	}

	// Sort the rows in memory using SliceStable to maintain existing ordering
	// where values are identical.
	sort.SliceStable(data.Rows, func(i, j int) bool {
		for _, rule := range rules {
			valI, _ := data.Rows[i][rule.Column].(string)
			valJ, _ := data.Rows[j][rule.Column].(string)

			if valI == valJ {
				continue
			}

			// Optional numeric sorting check
			numI, errI := strconv.ParseFloat(valI, 64)
			numJ, errJ := strconv.ParseFloat(valJ, 64)
			if errI == nil && errJ == nil {
				if numI == numJ {
					continue
				}
				if rule.Dir == "desc" {
					return numI > numJ
				}
				return numI < numJ
			}

			// Standard string fallback sorting
			strI := strings.ToUpper(valI)
			strJ := strings.ToUpper(valJ)
			if strI == strJ {
				continue
			}

			if rule.Dir == "desc" {
				return strI > strJ
			}
			return strI < strJ
		}
		// If all columns evaluated as equal or there are no rules
		return false
	})

	// Return sorted dataset
	rows := make([]any, len(data.Rows))
	for i, r := range data.Rows {
		rows[i] = r
	}

	return map[string]any{
		"columns":  convertToAnySlice(data.Columns),
		"rows":     rows,
		"rowCount": len(rows),
	}
}
