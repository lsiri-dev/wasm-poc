# wasm-poc

React + Go WASM proof-of-concept for CSV parsing, filtering, sorting, pagination, and export in a Web Worker.

## Prerequisites

- Node.js 18+
- Go 1.22+ (must be available in your terminal `PATH`)

## Install frontend deps

```bash
cd frontend
npm install
```

## Build WASM runtime

From `frontend/`:

```bash
npm run build:wasm
```

This command:

- compiles `wasm/main.go` to `frontend/public/main.wasm`
- refreshes `frontend/public/wasm_exec.js` from your local Go installation

## Run locally

```bash
cd frontend
npm run dev
```

If you want to always rebuild WASM before dev startup:

```bash
npm run dev:with-wasm
```

## Production build

```bash
cd frontend
npm run build:all
```