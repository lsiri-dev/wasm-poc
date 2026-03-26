import init, {
  parseCSV, getPage, sortDataset, filterDataset,
  getDataset, listDatasets, deleteDataset, exportCSV
} from '/rust/rust_worker.js';

self.window = self;

let wasmReady = false;
let wasmInitPromise = null;

function postSuccess(requestId, action, data, executionMs, trace = {}) {
  self.postMessage({
    requestId,
    action,
    ok: true,
    data,
    executionMs,
    trace: {
      ...trace,
      workerRespondedAtEpoch: Date.now()
    }
  });
}

function postError(requestId, action, error) {
  self.postMessage({
    requestId,
    action,
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  });
}

async function initWasm() {
  if (wasmReady) {
    return;
  }

  if (wasmInitPromise) {
    return wasmInitPromise;
  }

  wasmInitPromise = (async () => {
    await init();
    wasmReady = true;
  })();

  return wasmInitPromise;
}

function ensureReady() {
  if (!wasmReady) {
    throw new Error("Rust WASM is not initialized. Send INIT first.");
  }
}

self.onmessage = async (event) => {
  const { requestId, action, payload = {}, clientSentAtEpoch } = event.data || {};
  const traceBase = {
    clientSentAtEpoch,
    workerReceivedAtEpoch: Date.now()
  };

  try {
    switch (action) {
      case "INIT": {
        await initWasm();
        postSuccess(requestId, action, { ready: true }, undefined, traceBase);
        return;
      }

      case "PARSE_CSV": {
        ensureReady();
        const start = performance.now();
        const result = parseCSV(payload.csvText || "");
        const executionMs = performance.now() - start;
        if (result?.error) throw new Error(result.error);
        if (result) {
            result.parseTimeMs = executionMs;
        }
        postSuccess(requestId, action, result, executionMs, traceBase);
        return;
      }

      case "GET_PAGE": {
        ensureReady();
        const result = getPage(payload.datasetId, payload.offset ?? 0, payload.limit ?? 200);
        if (result?.error) throw new Error(result.error);
        postSuccess(requestId, action, result, undefined, traceBase);
        return;
      }

      case "SORT": {
        ensureReady();
        const start = performance.now();
        const result = sortDataset(payload.datasetId, JSON.stringify(payload.rules || []));
        const executionMs = performance.now() - start;
        if (result?.error) throw new Error(result.error);
        postSuccess(requestId, action, result, executionMs, traceBase);
        return;
      }

      case "FILTER": {
        ensureReady();
        const start = performance.now();
        const result = filterDataset(payload.datasetId, JSON.stringify(payload.rules || []));
        const executionMs = performance.now() - start;
        if (result?.error) throw new Error(result.error);
        postSuccess(requestId, action, result, executionMs, traceBase);
        return;
      }

      case "GET_DATASET": {
        ensureReady();
        const result = getDataset(payload.datasetId);
        if (result?.error) throw new Error(result.error);
        postSuccess(requestId, action, result, undefined, traceBase);
        return;
      }

      case "LIST_DATASETS": {
        ensureReady();
        const result = listDatasets();
        postSuccess(requestId, action, result, undefined, traceBase);
        return;
      }

      case "DELETE_DATASET": {
        ensureReady();
        const result = deleteDataset(payload.datasetId);
        postSuccess(requestId, action, result, undefined, traceBase);
        return;
      }

      case "EXPORT": {
        ensureReady();
        const colsJson = JSON.stringify(payload.columns || []);
        const result = exportCSV(payload.datasetId, colsJson);
        if (result?.error) throw new Error(result.error);
        postSuccess(requestId, action, result, undefined, traceBase);
        return;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } catch (error) {
    postError(requestId, action, error);
  }
};
