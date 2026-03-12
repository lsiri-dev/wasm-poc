package main

import (
	"syscall/js"
)

func parseCSV(this js.Value, args []js.Value) interface{} {
	csvText := args[0].String()

	println("CSV received:")
	println(csvText)

	return nil
}

func main() {
	js.Global().Set("parseCSV", js.FuncOf(parseCSV))

	select {}
}