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
		"columns": convertToAnySlice(data.Columns),
		"rows":    data.Rows,
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