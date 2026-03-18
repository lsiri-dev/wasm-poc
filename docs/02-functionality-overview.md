# Functionality Overview (Current System)

## High-level architecture

The application is a browser-based CSV workbench powered by:
- React frontend for UI rendering and interaction
- Go WebAssembly engine for dataset parsing and transformations
- Web Worker as execution boundary between UI and WASM runtime

Core design principle:
- Keep bulk data in WASM memory
- Move only metadata and requested row pages to the UI

---

## End-to-end workflow

### 1) Worker initialization
On app start:
1. React creates the worker
2. Worker handles `INIT`
3. Worker imports `wasm_exec.js`, instantiates `main.wasm`, runs Go runtime
4. Worker reports ready state to UI

### 2) CSV upload and parse
When user uploads CSV:
1. UI sends `PARSE_CSV` with file text
2. WASM parses CSV and stores dataset in memory
3. WASM returns metadata:
   - dataset id
   - columns
   - rowCount
   - parseTimeMs
4. UI immediately requests first page via `GET_PAGE`

### 3) Pagination
For each page action:
1. UI computes `offset` and `limit`
2. UI sends `GET_PAGE(datasetId, offset, limit)`
3. WASM returns only page rows + total row count
4. UI renders current page table

### 4) Sorting
When user clicks table headers:
1. UI updates sort rules (single click or shift+click multi-sort)
2. UI sends `SORT` with rules
3. Worker measures execution time (`performance.now()`)
4. WASM sorts active rows in memory
5. WASM returns metadata
6. UI fetches page 1 via `GET_PAGE`
7. UI displays sort benchmark ms

### 5) Filtering
When user applies filters:
1. UI sends `FILTER` with rule pipeline
2. Worker measures execution time
3. WASM filters from base dataset and updates active rows
4. WASM returns metadata
5. UI fetches page 1 via `GET_PAGE`
6. UI displays filter benchmark ms

Reset filtering:
- Empty rules cause WASM to restore active rows from base rows

### 6) Dataset management
Supported operations:
- list datasets
- select active dataset
- delete dataset

Selection flow:
- metadata request for selected dataset
- page fetch for visible rows

### 7) Export
UI sends selected columns + dataset id to worker `EXPORT` action.
WASM returns CSV string, and UI triggers browser download.

---

## Data model and state ownership

### WASM ownership
Each dataset stores:
- `Columns` (headers)
- `BaseRows` (original parsed dataset)
- `Rows` (current active view after filter/sort)

### React ownership
UI stores lightweight interaction state:
- active dataset id
- current page rows only
- columns, rowCount
- sort/filter rules
- rowsPerPage/currentPage
- async status flags
- benchmark timings

This split minimizes memory pressure in React and avoids repeated large transfers.

---

## Worker message protocol

### Request envelope
Each request from UI to worker contains:
- `requestId`
- `action`
- `payload`

### Response envelope
Each worker response contains:
- `requestId`
- `action`
- `ok`
- `data` (or `error`)
- `executionMs` for timed actions

Actions currently supported:
- `INIT`
- `PARSE_CSV`
- `GET_PAGE`
- `SORT`
- `FILTER`
- `GET_DATASET`
- `LIST_DATASETS`
- `DELETE_DATASET`
- `EXPORT`

---

## UI modules

Main orchestration:
- `frontend/src/components/CSVUploader.jsx`

Presentation modules:
- `frontend/src/components/csv/DatasetControls.jsx`
- `frontend/src/components/csv/FilterPanel.jsx`
- `frontend/src/components/csv/ExportPanel.jsx`
- `frontend/src/components/csv/DataTable.jsx`
- `frontend/src/components/csv/PaginationAndMetrics.jsx`
- `frontend/src/components/csv/constants.js`

Worker hook:
- `frontend/src/hooks/useWasmWorker.js`

---

## Performance benchmarking in UI

The benchmark panel currently shows:
- parse time (`parseTimeMs`) from WASM parse result
- sort execution time from worker timer
- filter execution time from worker timer

Interpretation guidance:
- Parse time is measured in Go/WASM parse path
- Sort/filter times reflect worker-side operation duration
- UI render time and browser paint time are not included

For complete profiling, combine these with browser Performance panel traces.

---

## Error handling behavior

- Worker returns structured error responses (`ok: false`)
- Hook maps failures to rejected promises
- `CSVUploader` catches and displays user-visible errors
- Pending requests are rejected if worker terminates

---

## Current capabilities checklist

- Upload CSV and parse into WASM memory
- Keep multiple datasets in session
- View paged rows
- Sort single/multiple columns
- Filter with rule pipeline (`and`/`or`)
- Reset filter to original dataset
- Export selected columns to CSV
- Display operation timings for perf testing

---

## Recommended next improvements

1. Add single combined query endpoint (`filter + sort + page`) to reduce round-trips.
2. Add page prefetch (next page) for smoother navigation.
3. Add explicit benchmark breakdown fields:
   - wasm execution
   - worker serialization
   - main-thread render
4. Add large export strategy (chunked/streaming) if export size becomes bottleneck.

