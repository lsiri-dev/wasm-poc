package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"syscall/js"
)

// FilterRule describes a single filter condition.
//
//	Operators : eq | neq | contains | not_contains | gt | gte | lt | lte
//	Logic     : "and" (default) | "or"  — how this rule combines with the previous result
type FilterRule struct {
	Column   string `json:"column"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
	Logic    string `json:"logic"` // "and" | "or"
}

// matchesRule tests a single cell value against one rule.
func matchesRule(cellValue string, rule FilterRule) bool {
	switch rule.Operator {
	case "eq":
		return strings.EqualFold(cellValue, rule.Value)
	case "neq":
		return !strings.EqualFold(cellValue, rule.Value)
	case "contains":
		return strings.Contains(strings.ToLower(cellValue), strings.ToLower(rule.Value))
	case "not_contains":
		return !strings.Contains(strings.ToLower(cellValue), strings.ToLower(rule.Value))
	case "gt":
		a, err1 := strconv.ParseFloat(cellValue, 64)
		b, err2 := strconv.ParseFloat(rule.Value, 64)
		return err1 == nil && err2 == nil && a > b
	case "gte":
		a, err1 := strconv.ParseFloat(cellValue, 64)
		b, err2 := strconv.ParseFloat(rule.Value, 64)
		return err1 == nil && err2 == nil && a >= b
	case "lt":
		a, err1 := strconv.ParseFloat(cellValue, 64)
		b, err2 := strconv.ParseFloat(rule.Value, 64)
		return err1 == nil && err2 == nil && a < b
	case "lte":
		a, err1 := strconv.ParseFloat(cellValue, 64)
		b, err2 := strconv.ParseFloat(rule.Value, 64)
		return err1 == nil && err2 == nil && a <= b
	}
	return false
}

// applyPipeline runs rules sequentially over index sets.
//
//   - AND: narrows the active set — each step is faster as the set shrinks.
//   - OR:  unions new matches from the full dataset into the active set.
//
// The first rule always seeds the active set (treated as AND).
func applyPipeline(allRows []map[string]any, rules []FilterRule) []map[string]any {
	if len(rules) == 0 {
		return allRows
	}

	// Seed: apply first rule against all rows.
	active := make([]int, 0, len(allRows))
	first := rules[0]
	for i, row := range allRows {
		cell, _ := row[first.Column].(string)
		if matchesRule(cell, first) {
			active = append(active, i)
		}
	}

	for _, rule := range rules[1:] {
		if rule.Logic == "or" {
			// Build lookup of already active indices.
			inActive := make(map[int]struct{}, len(active))
			for _, idx := range active {
				inActive[idx] = struct{}{}
			}
			// Add any row from the full set that matches and isn't active yet.
			for i, row := range allRows {
				if _, exists := inActive[i]; !exists {
					cell, _ := row[rule.Column].(string)
					if matchesRule(cell, rule) {
						active = append(active, i)
					}
				}
			}
		} else { // "and"
			// Filter only the active (shrinking) set — efficient.
			filtered := make([]int, 0, len(active))
			for _, idx := range active {
				cell, _ := allRows[idx][rule.Column].(string)
				if matchesRule(cell, rule) {
					filtered = append(filtered, idx)
				}
			}
			active = filtered
		}
	}

	result := make([]map[string]any, len(active))
	for i, idx := range active {
		result[i] = allRows[idx]
	}
	return result
}

// FilterDataset is the WASM-exported function.
// JS call: filterDataset(datasetID, rulesJSON)
// Example rule: {"column":"Age","operator":"gt","value":"30","logic":"and"}
// Returns: { columns, rows, rowCount } or { error }
func FilterDataset(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return map[string]any{"error": "usage: filterDataset(datasetID, rulesJSON)"}
	}

	id := args[0].String()
	data, ok := datasets[id]
	if !ok {
		return map[string]any{"error": "dataset not found: " + id}
	}

	var rules []FilterRule
	if err := json.Unmarshal([]byte(args[1].String()), &rules); err != nil {
		return map[string]any{"error": "invalid rules JSON: " + err.Error()}
	}

	filtered := applyPipeline(data.Rows, rules)

	rows := make([]any, len(filtered))
	for i, r := range filtered {
		rows[i] = r
	}

	return map[string]any{
		"columns":  convertToAnySlice(data.Columns),
		"rows":     rows,
		"rowCount": len(rows),
	}
}
