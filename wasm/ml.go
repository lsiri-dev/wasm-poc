package main

import (
	"fmt"
	"syscall/js"
	"unsafe"
)

func copyFloat64ArrayToGo(float64Array js.Value) ([]float64, error) {
	if float64Array.IsNull() || float64Array.IsUndefined() {
		return nil, fmt.Errorf("Float64Array is required")
	}

	length := float64Array.Get("length").Int()
	if length < 0 {
		return nil, fmt.Errorf("invalid Float64Array length")
	}

	out := make([]float64, length)
	if length == 0 {
		return out, nil
	}

	byteLen := length * 8
	buffer := float64Array.Get("buffer")
	byteOffset := float64Array.Get("byteOffset").Int()
	jsBytes := js.Global().Get("Uint8Array").New(buffer, byteOffset, byteLen)

	goBytes := unsafe.Slice((*byte)(unsafe.Pointer(&out[0])), byteLen)
	copied := js.CopyBytesToGo(goBytes, jsBytes)
	if copied != byteLen {
		return nil, fmt.Errorf("copied %d bytes, expected %d", copied, byteLen)
	}

	return out, nil
}

func TrainLinearRegression(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return map[string]any{"error": "usage: trainLinearRegression(experienceArr, salaryArr, epochs?, learningRate?)"}
	}

	experienceArrJS := args[0]
	salaryArrJS := args[1]

	if experienceArrJS.IsNull() || experienceArrJS.IsUndefined() || salaryArrJS.IsNull() || salaryArrJS.IsUndefined() {
		return map[string]any{"error": "experienceArr and salaryArr are required"}
	}

	n := experienceArrJS.Get("length").Int()
	if n == 0 {
		return map[string]any{"error": "experienceArr is empty"}
	}
	if salaryArrJS.Get("length").Int() != n {
		return map[string]any{"error": "experienceArr and salaryArr must have the same length"}
	}

	experienceArr, err := copyFloat64ArrayToGo(experienceArrJS)
	if err != nil {
		return map[string]any{"error": "failed to copy experienceArr: " + err.Error()}
	}

	salaryArr, err := copyFloat64ArrayToGo(salaryArrJS)
	if err != nil {
		return map[string]any{"error": "failed to copy salaryArr: " + err.Error()}
	}

	epochs := 10000
	learningRate := 0.01

	if len(args) >= 3 && !args[2].IsUndefined() && !args[2].IsNull() {
		epochs = args[2].Int()
	}
	if len(args) >= 4 && !args[3].IsUndefined() && !args[3].IsNull() {
		learningRate = args[3].Float()
	}

	if epochs <= 0 {
		return map[string]any{"error": "epochs must be > 0"}
	}
	if learningRate <= 0 {
		return map[string]any{"error": "learningRate must be > 0"}
	}

	invN := 2.0 / float64(n)
	m := 0.0
	b := 0.0

	for epoch := 0; epoch < epochs; epoch++ {
		gradM := 0.0
		gradB := 0.0

		for i := 0; i < n; i++ {
			x := experienceArr[i]
			y := salaryArr[i]

			errorTerm := (m*x + b) - y
			gradM += errorTerm * x
			gradB += errorTerm
		}

		m -= learningRate * invN * gradM
		b -= learningRate * invN * gradB
	}

	return map[string]any{
		"m": m,
		"b": b,
	}
}
