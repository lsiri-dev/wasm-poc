self.window = self

let wasmReady = false
let wasmInitPromise = null

function normalizeFloat64Array(values) {
  const length = values.length
  if (length === 0) {
    return {
      normalized: new Float64Array(0),
      min: 0,
      max: 0
    }
  }

  let min = values[0]
  let max = values[0]

  for (let i = 1; i < length; i += 1) {
    const value = values[i]
    if (value < min) min = value
    if (value > max) max = value
  }

  const normalized = new Float64Array(length)
  const range = max - min

  if (range === 0) {
    return { normalized, min, max }
  }

  for (let i = 0; i < length; i += 1) {
    normalized[i] = (values[i] - min) / range
  }

  return {
    normalized,
    min,
    max
  }
}

function prepareBenchmarkData(datasetRows = []) {
  const length = datasetRows.length
  const experienceRaw = new Float64Array(length)
  const salaryRaw = new Float64Array(length)

  for (let i = 0; i < length; i += 1) {
    const row = datasetRows[i] || {}
    const experience = Number(row.experience)
    const salary = Number(row.salary_usd)

    experienceRaw[i] = Number.isFinite(experience) ? experience : 0
    salaryRaw[i] = Number.isFinite(salary) ? salary : 0
  }

  const experienceStats = normalizeFloat64Array(experienceRaw)
  const salaryStats = normalizeFloat64Array(salaryRaw)

  return {
    experienceArr: experienceStats.normalized,
    salaryArr: salaryStats.normalized,
    experienceMin: experienceStats.min,
    experienceMax: experienceStats.max,
    salaryMin: salaryStats.min,
    salaryMax: salaryStats.max
  }
}

function prepareFeatureArrays(datasetRows = []) {
  const length = datasetRows.length
  const experience = new Uint32Array(length)
  const countryId = new Uint32Array(length)
  const educationLevel = new Uint32Array(length)
  const langCount = new Uint32Array(length)
  const frameworkCount = new Uint32Array(length)
  const companySize = new Uint32Array(length)

  for (let i = 0; i < length; i += 1) {
    const row = datasetRows[i] || {}
    const exp = Number(row.experience)
    const country = Number(row.country_id)
    const edu = Number(row.education_level)
    const lang = Number(row.lang_count)
    const fw = Number(row.framework_count)
    const size = Number(row.company_size)

    experience[i] = Number.isFinite(exp) ? Math.max(0, Math.floor(exp * 100)) >>> 0 : 0
    countryId[i] = Number.isFinite(country) ? Math.max(0, Math.floor(country)) >>> 0 : 0
    educationLevel[i] = Number.isFinite(edu) ? Math.max(0, Math.floor(edu)) >>> 0 : 0
    langCount[i] = Number.isFinite(lang) ? Math.max(0, Math.floor(lang)) >>> 0 : 0
    frameworkCount[i] = Number.isFinite(fw) ? Math.max(0, Math.floor(fw)) >>> 0 : 0
    companySize[i] = Number.isFinite(size) ? Math.max(0, Math.floor(size)) >>> 0 : 0
  }

  return {
    experience,
    countryId,
    educationLevel,
    langCount,
    frameworkCount,
    companySize
  }
}

function trainJS(experienceArr, salaryArr, epochs = 10000, learningRate = 0.01) {
  const n = experienceArr.length
  if (n === 0) {
    return { m: 0, b: 0 }
  }
  if (salaryArr.length !== n) {
    throw new Error("experienceArr and salaryArr must have the same length")
  }

  let m = 0
  let b = 0
  const invN = 2 / n

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let gradM = 0
    let gradB = 0

    for (let i = 0; i < n; i += 1) {
      const x = experienceArr[i]
      const y = salaryArr[i]
      const errorTerm = (m * x + b) - y
      gradM += errorTerm * x
      gradB += errorTerm
    }

    m -= learningRate * invN * gradM
    b -= learningRate * invN * gradB
  }

  return { m, b }
}

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
  })
}

function postError(requestId, action, error) {
  self.postMessage({
    requestId,
    action,
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  })
}

async function initWasm() {
  if (wasmReady) {
    return
  }

  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    self.importScripts("/wasm_exec.js")
    const go = new self.Go()

    const result = await WebAssembly.instantiateStreaming(
      fetch("/main.wasm?t=" + new Date().getTime()),
      go.importObject
    )

    go.run(result.instance)
    wasmReady = true
  })()

  return wasmInitPromise
}

function ensureReady() {
  if (!wasmReady) {
    throw new Error("WASM is not initialized. Send INIT first.")
  }
}

self.onmessage = async (event) => {
  const { requestId, action, payload = {}, clientSentAtEpoch } = event.data || {}
  const traceBase = {
    clientSentAtEpoch,
    workerReceivedAtEpoch: Date.now()
  }

  try {
    switch (action) {
      case "INIT": {
        await initWasm()
        postSuccess(requestId, action, { ready: true }, undefined, traceBase)
        return
      }

      case "PARSE_CSV": {
        ensureReady()
        const result = self.parseCSV(payload.csvText || "")
        if (result?.error) throw new Error(result.error)
        postSuccess(requestId, action, result, undefined, traceBase)
        return
      }

      case "GET_PAGE": {
        ensureReady()
        const result = self.getPage(payload.datasetId, payload.offset ?? 0, payload.limit ?? 200)
        if (result?.error) throw new Error(result.error)
        postSuccess(requestId, action, result, undefined, traceBase)
        return
      }

      case "SORT": {
        ensureReady()
        const start = performance.now()
        const result = self.sortDataset(payload.datasetId, JSON.stringify(payload.rules || []))
        const executionMs = performance.now() - start
        if (result?.error) throw new Error(result.error)
        postSuccess(requestId, action, result, executionMs, traceBase)
        return
      }

      case "FILTER": {
        ensureReady()
        const start = performance.now()
        const result = self.filterDataset(payload.datasetId, JSON.stringify(payload.rules || []))
        const executionMs = performance.now() - start
        if (result?.error) throw new Error(result.error)
        postSuccess(requestId, action, result, executionMs, traceBase)
        return
      }

      case "GET_DATASET": {
        ensureReady()
        const result = self.getDataset(payload.datasetId)
        if (result?.error) throw new Error(result.error)
        postSuccess(requestId, action, result, undefined, traceBase)
        return
      }

      case "LIST_DATASETS": {
        ensureReady()
        const result = self.listDatasets()
        postSuccess(requestId, action, result, undefined, traceBase)
        return
      }

      case "DELETE_DATASET": {
        ensureReady()
        const result = self.deleteDataset(payload.datasetId)
        postSuccess(requestId, action, result, undefined, traceBase)
        return
      }

      case "EXPORT": {
        ensureReady()
        const colsJson = JSON.stringify(payload.columns || [])
        const result = self.exportCSV(payload.datasetId, colsJson)
        if (result?.error) throw new Error(result.error)
        postSuccess(requestId, action, result, undefined, traceBase)
        return
      }

      case "START_ML_BENCHMARK": {
        ensureReady()

        const epochs = Number.isFinite(payload.epochs) ? payload.epochs : 10000
        const learningRate = Number.isFinite(payload.learningRate) ? payload.learningRate : 0.01

        let experienceArr = payload.experienceArr
        let salaryArr = payload.salaryArr

        if (!(experienceArr instanceof Float64Array) || !(salaryArr instanceof Float64Array)) {
          if (Array.isArray(payload.datasetRows)) {
            const prepared = prepareBenchmarkData(payload.datasetRows)
            experienceArr = prepared.experienceArr
            salaryArr = prepared.salaryArr
          } else {
            throw new Error("START_ML_BENCHMARK requires Float64Array payloads: experienceArr and salaryArr")
          }
        }

        const jsStart = performance.now()
        const jsResult = trainJS(experienceArr, salaryArr, epochs, learningRate)
        const jsMs = performance.now() - jsStart

        const wasmStart = performance.now()
        const wasmResult = self.trainLinearRegression(experienceArr, salaryArr, epochs, learningRate)
        const wasmMs = performance.now() - wasmStart

        if (wasmResult?.error) {
          throw new Error(wasmResult.error)
        }

        postSuccess(requestId, action, {
          rows: experienceArr.length,
          epochs,
          learningRate,
          timingsMs: {
            js: jsMs,
            wasm: wasmMs
          },
          jsModel: {
            m: jsResult.m,
            b: jsResult.b
          },
          wasmModel: {
            m: Number(wasmResult?.m ?? 0),
            b: Number(wasmResult?.b ?? 0)
          },
          deltas: {
            m: Math.abs(jsResult.m - Number(wasmResult?.m ?? 0)),
            b: Math.abs(jsResult.b - Number(wasmResult?.b ?? 0))
          }
        }, undefined, traceBase)
        return
      }

      case "START_ML_BENCHMARK_GO": {
        ensureReady()

        const epochs = Number.isFinite(payload.epochs) ? payload.epochs : 10000
        const learningRate = Number.isFinite(payload.learningRate) ? payload.learningRate : 0.01

        let experienceArr = payload.experienceArr
        let salaryArr = payload.salaryArr

        if (!(experienceArr instanceof Float64Array) || !(salaryArr instanceof Float64Array)) {
          if (Array.isArray(payload.datasetRows)) {
            const prepared = prepareBenchmarkData(payload.datasetRows)
            experienceArr = prepared.experienceArr
            salaryArr = prepared.salaryArr
          } else {
            throw new Error("START_ML_BENCHMARK_GO requires datasetRows or Float64Array payloads")
          }
        }

        const wasmStart = performance.now()
        const wasmResult = self.trainLinearRegression(experienceArr, salaryArr, epochs, learningRate)
        const wasmMs = performance.now() - wasmStart

        if (wasmResult?.error) {
          throw new Error(wasmResult.error)
        }

        postSuccess(requestId, action, {
          rows: experienceArr.length,
          epochs,
          learningRate,
          timingsMs: {
            wasm: wasmMs
          },
          wasmModel: {
            m: Number(wasmResult?.m ?? 0),
            b: Number(wasmResult?.b ?? 0)
          }
        }, wasmMs, traceBase)
        return
      }

      case "START_GO_FAVOR_BENCHMARK_GO": {
        ensureReady()

        const rounds = Number.isFinite(payload.rounds) ? payload.rounds : 48

        const wasmStart = performance.now()
        let wasmResult
        if (payload.datasetId) {
          wasmResult = self.hashFeaturesU64ForDataset(payload.datasetId, rounds)
        } else {
          let featureArrays = payload.featureArrays
          if (!featureArrays && Array.isArray(payload.datasetRows)) {
            featureArrays = prepareFeatureArrays(payload.datasetRows)
          }
          if (!featureArrays) {
            throw new Error("START_GO_FAVOR_BENCHMARK_GO requires datasetId, datasetRows, or featureArrays")
          }

          wasmResult = self.hashFeaturesU64(
            featureArrays.experience,
            featureArrays.countryId,
            featureArrays.educationLevel,
            featureArrays.langCount,
            featureArrays.frameworkCount,
            featureArrays.companySize,
            rounds
          )
        }
        const wasmMs = performance.now() - wasmStart

        if (wasmResult?.error) {
          throw new Error(wasmResult.error)
        }

        postSuccess(requestId, action, {
          rows: Number(wasmResult?.rows ?? 0),
          rounds: Number(wasmResult?.rounds ?? rounds),
          checksum: String(wasmResult?.checksum ?? ""),
          timingsMs: {
            wasm: wasmMs
          }
        }, wasmMs, traceBase)
        return
      }

      default:
        throw new Error(`Unsupported action: ${action}`)
    }
  } catch (error) {
    postError(requestId, action, error)
  }
}
