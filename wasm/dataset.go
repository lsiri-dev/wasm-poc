package main

import "syscall/js"

func GetDataset(this js.Value, args []js.Value) any {

	if len(args) < 1 {
		return map[string]any{"error": "dataset id required"}
	}

	id := args[0].String()

	data, ok := datasets[id]

	if !ok {
		return map[string]any{"error": "dataset not found"}
	}

	return map[string]any{
		"id":       id,
		"columns":  convertToAnySlice(data.Columns),
		"rowCount": len(data.Rows),
	}
}

func GetPage(this js.Value, args []js.Value) any {
	if len(args) < 3 {
		return map[string]any{"error": "usage: getPage(datasetID, offset, limit)"}
	}

	id := args[0].String()
	offset := args[1].Int()
	limit := args[2].Int()

	if offset < 0 {
		offset = 0
	}

	if limit <= 0 {
		limit = 200
	}

	data, ok := datasets[id]
	if !ok {
		return map[string]any{"error": "dataset not found"}
	}

	total := len(data.Rows)
	if offset > total {
		offset = total
	}

	end := offset + limit
	if end > total {
		end = total
	}

	rows := make([]any, 0, end-offset)
	for _, row := range data.Rows[offset:end] {
		rows = append(rows, row)
	}

	return map[string]any{
		"id":       id,
		"columns":  convertToAnySlice(data.Columns),
		"rows":     rows,
		"offset":   offset,
		"limit":    limit,
		"rowCount": total,
	}
}

func DeleteDataset(this js.Value, args []js.Value) any {

	if len(args) < 1 {
		return "dataset id required"
	}

	id := args[0].String()

	delete(datasets, id)

	return "dataset deleted"
}

func ListDatasets(this js.Value, args []js.Value) any {

	var ids []any

	for id := range datasets {
		ids = append(ids, id)
	}

	return ids
}