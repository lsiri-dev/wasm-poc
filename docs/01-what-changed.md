# What Changed: Worker + WASM Pagination Refactor

## Purpose of this change
The previous implementation executed Go/WASM calls from the browser main thread and returned full row arrays for parse/sort/filter operations. With large CSVs (40k+ rows), this caused:
- UI freezes from synchronous work on the main thread
- Heavy WASM-to-JS serialization overhead
- Large React state payloads and expensive rerenders

This refactor moves execution to a Web Worker and changes the data contract to metadata + page-based retrieval.

---

## Summary of key changes

### 1) Go/WASM API contract changes

#### Metadata-first responses
The following functions no longer return full `rows` arrays:
- `parseCSV(csvRawData)`
- `sortDataset(datasetID, rulesJSON)`
- `filterDataset(datasetID, rulesJSON)`

They now return metadata only (shape varies slightly by function, but includes):
- `id`
- `columns`
- `rowCount`
- `parseTimeMs` (parse only)

#### New paged data endpoint
Added:
- `getPage(datasetID, offset, limit)`

Response includes:
- `id`
- `columns`
- `rows` (only requested slice)
- `offset`
- `limit`
- `rowCount` (total rows currently active in dataset view)

#### In-memory data retention model
`SessionData` now keeps:
- `BaseRows`: original parsed rows
- `Rows`: current active rows (after filter/sort state)

Behavior:
- Parse fills both `BaseRows` and `Rows`
- Filter applies against `BaseRows`, stores result in `Rows`
- Filter with empty rule set resets `Rows` back to `BaseRows`
- Sort operates on current `Rows`

This ensures large data remains in WASM memory while UI receives only what it needs per page.

---

### 2) Worker architecture introduced

Added worker file:
- `frontend/public/wasm.worker.js`

Worker responsibilities:
- Initialize Go runtime and `.wasm`
- Own all WASM function calls
- Expose message-driven command interface

Supported actions:
- `INIT`
- `PARSE_CSV`
- `GET_PAGE`
- `SORT`
- `FILTER`
- `GET_DATASET`
- `LIST_DATASETS`
- `DELETE_DATASET`
- `EXPORT`

Timing instrumentation:
- `SORT` and `FILTER` are wrapped with `performance.now()` inside worker
- Returned as `executionMs` to main thread
- Represents worker-side operation duration for benchmarking

---

### 3) React refactor + modularization

Main-thread WASM bootstrap removed from:
- `frontend/src/main.jsx`

New worker hook added:
- `frontend/src/hooks/useWasmWorker.js`

Main component refactored to async worker-driven flow:
- `frontend/src/components/CSVUploader.jsx`

Component modularization:
- `frontend/src/components/csv/DatasetControls.jsx`
- `frontend/src/components/csv/FilterPanel.jsx`
- `frontend/src/components/csv/ExportPanel.jsx`
- `frontend/src/components/csv/DataTable.jsx`
- `frontend/src/components/csv/PaginationAndMetrics.jsx`
- `frontend/src/components/csv/constants.js`

UI flow now:
1. Upload CSV → `PARSE_CSV` (metadata response)
2. Immediately request first page via `GET_PAGE(offset=0, limit=rowsPerPage)`
3. Render current page only
4. Sort/filter update metadata + request page 1 again

---

## File-level change map

### Backend (Go)
- `wasm/main.go`
  - Added `BaseRows` to `SessionData`
  - Registered `getPage`
  - Removed full-row return from parse result
- `wasm/dataset.go`
  - `getDataset` returns metadata only
  - Added `getPage`
- `wasm/filter.go`
  - Returns metadata only
  - Updates `Rows` in-memory; supports reset via empty rules
- `wasm/sort.go`
  - Returns metadata only
  - Sorts active `Rows` in-memory

### Frontend
- `frontend/public/wasm.worker.js`
  - New worker runtime + message protocol
- `frontend/src/main.jsx`
  - Removed direct wasm init (worker owns runtime)
- `frontend/src/hooks/useWasmWorker.js`
  - New request/response bridge with pending promise map
- `frontend/src/components/CSVUploader.jsx`
  - Rewritten to worker-based async orchestration
- `frontend/src/components/csv/*`
  - Extracted modular UI sections

---

## Performance impact intent

Expected improvements from architecture changes:
- No blocking WASM calls on main UI thread
- Much smaller payload transfer (page rows vs full dataset)
- Reduced React memory and rerender pressure
- Built-in sort/filter timing visibility for benchmarking

---

## Known limitations after this refactor

- Sort and filter are still separate operations (not yet a single combined query pipeline)
- Worker timing includes operation + worker-side conversion overhead, but still excludes main-thread rendering time
- Page fetches are explicit calls; no prefetch strategy yet
- Very large exports can still be heavy (full CSV string generation)

---

## Validation status
- Frontend build succeeds after refactor
- Go toolchain is available in current environment (`go version` succeeded)

