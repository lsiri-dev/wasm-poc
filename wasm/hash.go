package main

import (
	"fmt"
	"strconv"
	"syscall/js"
	"unsafe"
)

const u64Mask uint64 = ^uint64(0)

func copyUint32ArrayToGo(uint32Array js.Value) ([]uint32, error) {
	if uint32Array.IsNull() || uint32Array.IsUndefined() {
		return nil, fmt.Errorf("Uint32Array is required")
	}

	length := uint32Array.Get("length").Int()
	if length < 0 {
		return nil, fmt.Errorf("invalid Uint32Array length")
	}

	out := make([]uint32, length)
	if length == 0 {
		return out, nil
	}

	byteLen := length * 4
	buffer := uint32Array.Get("buffer")
	byteOffset := uint32Array.Get("byteOffset").Int()
	jsBytes := js.Global().Get("Uint8Array").New(buffer, byteOffset, byteLen)

	goBytes := unsafe.Slice((*byte)(unsafe.Pointer(&out[0])), byteLen)
	copied := js.CopyBytesToGo(goBytes, jsBytes)
	if copied != byteLen {
		return nil, fmt.Errorf("copied %d bytes, expected %d", copied, byteLen)
	}

	return out, nil
}

func mix64(x uint64) uint64 {
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x &= u64Mask
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x &= u64Mask
	x ^= x >> 31
	return x & u64Mask
}

func parseUint32FromAny(value any, scale100 bool) uint32 {
	strValue, _ := value.(string)
	if strValue == "" {
		return 0
	}

	if scale100 {
		if parsedFloat, err := strconv.ParseFloat(strValue, 64); err == nil {
			if parsedFloat <= 0 {
				return 0
			}
			scaled := parsedFloat * 100.0
			if scaled > float64(^uint32(0)) {
				return ^uint32(0)
			}
			return uint32(scaled)
		}
	}

	if parsedUint, err := strconv.ParseUint(strValue, 10, 32); err == nil {
		return uint32(parsedUint)
	}

	if parsedFloat, err := strconv.ParseFloat(strValue, 64); err == nil {
		if parsedFloat <= 0 {
			return 0
		}
		if parsedFloat > float64(^uint32(0)) {
			return ^uint32(0)
		}
		return uint32(parsedFloat)
	}

	return 0
}

func prepareFeatureArraysFromRows(rows []map[string]any) ([]uint32, []uint32, []uint32, []uint32, []uint32, []uint32) {
	n := len(rows)
	exp := make([]uint32, n)
	country := make([]uint32, n)
	education := make([]uint32, n)
	langCount := make([]uint32, n)
	frameworkCount := make([]uint32, n)
	companySize := make([]uint32, n)

	for i := 0; i < n; i++ {
		row := rows[i]
		exp[i] = parseUint32FromAny(row["experience"], true)
		country[i] = parseUint32FromAny(row["country_id"], false)
		education[i] = parseUint32FromAny(row["education_level"], false)
		langCount[i] = parseUint32FromAny(row["lang_count"], false)
		frameworkCount[i] = parseUint32FromAny(row["framework_count"], false)
		companySize[i] = parseUint32FromAny(row["company_size"], false)
	}

	return exp, country, education, langCount, frameworkCount, companySize
}

func hashFeaturesCore(exp, country, education, langCount, frameworkCount, companySize []uint32, rounds int) (uint64, int, error) {
	n := len(exp)
	if n == 0 {
		return 0, 0, fmt.Errorf("input arrays are empty")
	}
	if len(country) != n || len(education) != n || len(langCount) != n || len(frameworkCount) != n || len(companySize) != n {
		return 0, 0, fmt.Errorf("all input arrays must have same length")
	}
	if rounds <= 0 {
		return 0, 0, fmt.Errorf("rounds must be > 0")
	}

	var acc uint64 = 0x9e3779b97f4a7c15
	const roundConst uint64 = 0x9e3779b97f4a7c15

	for r := 0; r < rounds; r++ {
		roundSalt := uint64(r+1) * roundConst
		for i := 0; i < n; i++ {
			v := (uint64(exp[i]) << 32) ^
				(uint64(country[i]) << 24) ^
				(uint64(education[i]) << 16) ^
				(uint64(langCount[i]) << 10) ^
				(uint64(frameworkCount[i]) << 4) ^
				uint64(companySize[i])
			x := mix64(v ^ roundSalt)
			acc ^= x + roundConst + (acc << 6) + (acc >> 2)
			acc &= u64Mask
		}
	}

	return acc, n, nil
}

func HashFeaturesU64(this js.Value, args []js.Value) any {
	if len(args) < 7 {
		return map[string]any{"error": "usage: hashFeaturesU64(exp,country,education,langCount,frameworkCount,companySize,rounds?)"}
	}

	expJS := args[0]
	countryJS := args[1]
	educationJS := args[2]
	langCountJS := args[3]
	frameworkCountJS := args[4]
	companySizeJS := args[5]

	exp, err := copyUint32ArrayToGo(expJS)
	if err != nil {
		return map[string]any{"error": "failed to copy experience: " + err.Error()}
	}
	country, err := copyUint32ArrayToGo(countryJS)
	if err != nil {
		return map[string]any{"error": "failed to copy country_id: " + err.Error()}
	}
	education, err := copyUint32ArrayToGo(educationJS)
	if err != nil {
		return map[string]any{"error": "failed to copy education_level: " + err.Error()}
	}
	langCount, err := copyUint32ArrayToGo(langCountJS)
	if err != nil {
		return map[string]any{"error": "failed to copy lang_count: " + err.Error()}
	}
	frameworkCount, err := copyUint32ArrayToGo(frameworkCountJS)
	if err != nil {
		return map[string]any{"error": "failed to copy framework_count: " + err.Error()}
	}
	companySize, err := copyUint32ArrayToGo(companySizeJS)
	if err != nil {
		return map[string]any{"error": "failed to copy company_size: " + err.Error()}
	}

	rounds := 48
	if len(args) >= 7 && !args[6].IsUndefined() && !args[6].IsNull() {
		rounds = args[6].Int()
	}

	acc, n, err := hashFeaturesCore(exp, country, education, langCount, frameworkCount, companySize, rounds)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	return map[string]any{
		"checksum": strconv.FormatUint(acc, 16),
		"rows":     n,
		"rounds":   rounds,
	}
}

func HashFeaturesU64ForDataset(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "usage: hashFeaturesU64ForDataset(datasetID, rounds?)"}
	}

	datasetID := args[0].String()
	data, ok := datasets[datasetID]
	if !ok {
		return map[string]any{"error": "dataset not found"}
	}

	rounds := 48
	if len(args) >= 2 && !args[1].IsUndefined() && !args[1].IsNull() {
		rounds = args[1].Int()
	}

	exp, country, education, langCount, frameworkCount, companySize := prepareFeatureArraysFromRows(data.Rows)

	acc, n, err := hashFeaturesCore(exp, country, education, langCount, frameworkCount, companySize, rounds)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	return map[string]any{
		"checksum": strconv.FormatUint(acc, 16),
		"rows":     n,
		"rounds":   rounds,
	}
}
