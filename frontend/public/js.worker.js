const datasets = {};

function normalizeFloat64Array(values) {
  const length = values.length;
  if (length === 0) {
    return new Float64Array(0);
  }

  let min = values[0];
  let max = values[0];

  for (let i = 1; i < length; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const normalized = new Float64Array(length);
  const range = max - min;
  if (range === 0) {
    return normalized;
  }

  for (let i = 0; i < length; i += 1) {
    normalized[i] = (values[i] - min) / range;
  }

  return normalized;
}

function prepareBenchmarkData(datasetRows = []) {
  const length = datasetRows.length;
  const experienceRaw = new Float64Array(length);
  const salaryRaw = new Float64Array(length);

  for (let i = 0; i < length; i += 1) {
    const row = datasetRows[i] || {};
    const experience = Number(row.experience);
    const salary = Number(row.salary_usd);

    experienceRaw[i] = Number.isFinite(experience) ? experience : 0;
    salaryRaw[i] = Number.isFinite(salary) ? salary : 0;
  }

  return {
    experienceArr: normalizeFloat64Array(experienceRaw),
    salaryArr: normalizeFloat64Array(salaryRaw)
  };
}

function trainJS(experienceArr, salaryArr, epochs = 10000, learningRate = 0.01) {
  const n = experienceArr.length;
  if (n === 0) {
    throw new Error("experienceArr is empty");
  }
  if (salaryArr.length !== n) {
    throw new Error("experienceArr and salaryArr must have the same length");
  }

  let m = 0;
  let b = 0;
  const invN = 2 / n;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let gradM = 0;
    let gradB = 0;

    for (let i = 0; i < n; i += 1) {
      const x = experienceArr[i];
      const y = salaryArr[i];
      const errorTerm = (m * x + b) - y;
      gradM += errorTerm * x;
      gradB += errorTerm;
    }

    m -= learningRate * invN * gradM;
    b -= learningRate * invN * gradB;
  }

  return { m, b };
}

function prepareFeatureArrays(datasetRows = []) {
  const length = datasetRows.length;
  const experience = new Uint32Array(length);
  const countryId = new Uint32Array(length);
  const educationLevel = new Uint32Array(length);
  const langCount = new Uint32Array(length);
  const frameworkCount = new Uint32Array(length);
  const companySize = new Uint32Array(length);

  for (let i = 0; i < length; i += 1) {
    const row = datasetRows[i] || {};
    const exp = Number(row.experience);
    const country = Number(row.country_id);
    const edu = Number(row.education_level);
    const lang = Number(row.lang_count);
    const fw = Number(row.framework_count);
    const size = Number(row.company_size);

    experience[i] = Number.isFinite(exp) ? Math.max(0, Math.floor(exp * 100)) >>> 0 : 0;
    countryId[i] = Number.isFinite(country) ? Math.max(0, Math.floor(country)) >>> 0 : 0;
    educationLevel[i] = Number.isFinite(edu) ? Math.max(0, Math.floor(edu)) >>> 0 : 0;
    langCount[i] = Number.isFinite(lang) ? Math.max(0, Math.floor(lang)) >>> 0 : 0;
    frameworkCount[i] = Number.isFinite(fw) ? Math.max(0, Math.floor(fw)) >>> 0 : 0;
    companySize[i] = Number.isFinite(size) ? Math.max(0, Math.floor(size)) >>> 0 : 0;
  }

  return {
    experience,
    countryId,
    educationLevel,
    langCount,
    frameworkCount,
    companySize
  };
}

function mix64BigInt(x) {
  const MASK = 0xffffffffffffffffn;
  x ^= x >> 30n;
  x = (x * 0xbf58476d1ce4e5b9n) & MASK;
  x ^= x >> 27n;
  x = (x * 0x94d049bb133111ebn) & MASK;
  x ^= x >> 31n;
  return x & MASK;
}

function hashFeaturesU64JS(featureArrays, rounds = 48) {
  const {
    experience,
    countryId,
    educationLevel,
    langCount,
    frameworkCount,
    companySize
  } = featureArrays;

  const n = experience.length;
  if (n === 0) {
    throw new Error("feature arrays are empty");
  }

  const MASK = 0xffffffffffffffffn;
  const ROUND_CONST = 0x9e3779b97f4a7c15n;
  let acc = ROUND_CONST;

  for (let r = 0; r < rounds; r += 1) {
    const roundSalt = BigInt(r + 1) * ROUND_CONST;
    for (let i = 0; i < n; i += 1) {
      const v =
        (BigInt(experience[i]) << 32n) ^
        (BigInt(countryId[i]) << 24n) ^
        (BigInt(educationLevel[i]) << 16n) ^
        (BigInt(langCount[i]) << 10n) ^
        (BigInt(frameworkCount[i]) << 4n) ^
        BigInt(companySize[i]);
      const x = mix64BigInt((v ^ roundSalt) & MASK);
      acc ^= (x + ROUND_CONST + ((acc << 6n) & MASK) + (acc >> 2n)) & MASK;
      acc &= MASK;
    }
  }

  return {
    checksum: acc.toString(16),
    rows: n,
    rounds
  };
}

function matchesRule(cellValue, rule) {
  const cellLower = String(cellValue || "").toLowerCase();
  const ruleValLower = String(rule.value || "").toLowerCase();
  const val = String(cellValue || "");

  switch (rule.operator) {
    case "eq":
      return cellLower === ruleValLower;
    case "neq":
      return cellLower !== ruleValLower;
    case "contains":
      return cellLower.includes(ruleValLower);
    case "not_contains":
      return !cellLower.includes(ruleValLower);
    case "gt": {
      const a = Number(val);
      const b = Number(rule.value);
      return !isNaN(a) && !isNaN(b) && a > b;
    }
    case "gte": {
      const a = Number(val);
      const b = Number(rule.value);
      return !isNaN(a) && !isNaN(b) && a >= b;
    }
    case "lt": {
      const a = Number(val);
      const b = Number(rule.value);
      return !isNaN(a) && !isNaN(b) && a < b;
    }
    case "lte": {
      const a = Number(val);
      const b = Number(rule.value);
      return !isNaN(a) && !isNaN(b) && a <= b;
    }
    default:
      return false;
  }
}

function applyPipeline(allRows, rules) {
  if (!rules || rules.length === 0) return [...allRows];

  let active = [];
  const first = rules[0];
  
  for (let i = 0; i < allRows.length; i++) {
    const cell = String(allRows[i][first.column] || "");
    if (matchesRule(cell, first)) {
      active.push(i);
    }
  }

  for (let j = 1; j < rules.length; j++) {
    const rule = rules[j];
    if (rule.logic === "or") {
      const inActive = new Set(active);
      for (let i = 0; i < allRows.length; i++) {
        if (!inActive.has(i)) {
          const cell = String(allRows[i][rule.column] || "");
          if (matchesRule(cell, rule)) {
            active.push(i);
          }
        }
      }
    } else {
      const filtered = [];
      for (let k = 0; k < active.length; k++) {
        const idx = active[k];
        const cell = String(allRows[idx][rule.column] || "");
        if (matchesRule(cell, rule)) {
          filtered.push(idx);
        }
      }
      active = filtered;
    }
  }

  return active.map(idx => allRows[idx]);
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
        self.postMessage({ requestId, action, ok: true, data: { ready: true }, trace: { ...traceBase, workerRespondedAtEpoch: Date.now() } });
        return;
      }

      case "PARSE_CSV": {
        const start = performance.now();
        const csvText = payload.csvText || "";
        if (!csvText) throw new Error("No CSV data provided");

        let records = []; 
        let row = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < csvText.length; i++) {
            let char = csvText[i];
            if (inQuote) {
                if (char === '"') {
                    if (i + 1 < csvText.length && csvText[i+1] === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuote = false;
                    }
                } else {
                    cur += char;
                }
            } else {
                if (char === '"') {
                    inQuote = true;
                } else if (char === ',') {
                    row.push(cur.trim());
                    cur = "";
                } else if (char === '\n' || char === '\r') {
                    if (char === '\r' && csvText[i+1] === '\n') {
                        i++;
                    }
                    row.push(cur.trim());
                    records.push(row);
                    row = [];
                    cur = "";
                } else {
                    cur += char;
                }
            }
        }
        if (cur || row.length > 0) {
            row.push(cur.trim());
            records.push(row);
        }
        
        if (records.length === 0) throw new Error("Empty CSV");
        
        const rawHeaders = records[0];
        const headers = [];
        const headerIndices = [];
        
        rawHeaders.forEach((h, i) => {
            const trimH = h.trim();
            if (trimH !== "") {
                headers.push(trimH);
                headerIndices.push(i);
            }
        });
        
        if (headers.length === 0) throw new Error("No valid headers found");
        
        const structuredRows = [];
        
        for (let i = 1; i < records.length; i++) {
            const record = records[i];
            let isEmptyRow = true;
            for (let j = 0; j < record.length; j++) {
                if (record[j] && record[j].trim() !== "") {
                    isEmptyRow = false;
                    break;
                }
            }
            if (isEmptyRow) continue;
            
            const rowMap = {};
            headerIndices.forEach((hIdx, colIdx) => {
                if (hIdx < record.length) {
                    rowMap[headers[colIdx]] = record[hIdx].trim();
                } else {
                    rowMap[headers[colIdx]] = "";
                }
            });
            structuredRows.push(rowMap);
        }
        
        const datasetID = "dataset_" + (Object.keys(datasets).length + 1);
        datasets[datasetID] = {
            Columns: headers,
            BaseRows: [...structuredRows],
            Rows: structuredRows
        };
        
        const executionMs = performance.now() - start;
        self.postMessage({
            requestId, action, ok: true,
            data: { id: datasetID, columns: headers, rowCount: structuredRows.length, parseTimeMs: executionMs },
          executionMs,
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "GET_PAGE": {
        const data = datasets[payload.datasetId];
        if (!data) throw new Error("dataset not found");
        
        let offset = payload.offset || 0;
        let limit = payload.limit || 200;
        const total = data.Rows.length;
        let end = offset + limit;
        if (end > total) end = total;
        
        const pageRows = (offset < total) ? data.Rows.slice(offset, end) : [];
        self.postMessage({
            requestId, action, ok: true,
          data: { id: payload.datasetId, columns: data.Columns, rowCount: total, rows: pageRows },
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "SORT": {
        const start = performance.now();
        const data = datasets[payload.datasetId];
        if (!data) throw new Error("dataset not found");
        
        const rules = payload.rules || [];
        if (rules.length === 0) {
            const executionMs = performance.now() - start;
            self.postMessage({
                requestId, action, ok: true,
                data: { id: payload.datasetId, columns: data.Columns, rowCount: data.Rows.length },
              executionMs,
              trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
            });
            return;
        }
        
        data.Rows.sort((a, b) => {
            for (const rule of rules) {
                const valA = String(a[rule.column] || "");
                const valB = String(b[rule.column] || "");
                if (valA === valB) continue;
                
                const numA = Number(valA);
                const numB = Number(valB);
                
                if (!isNaN(numA) && !isNaN(numB) && valA.trim() !== "" && valB.trim() !== "") {
                    if (numA === numB) continue;
                    if (rule.dir === "desc") return numB > numA ? 1 : -1;
                    return numA > numB ? 1 : -1;
                }
                
                const strA = valA.toUpperCase();
                const strB = valB.toUpperCase();
                if (strA === strB) continue;
                
                if (rule.dir === "desc") return strA > strB ? -1 : 1;
                return strA < strB ? -1 : 1;
            }
            return 0;
        });
        
        const executionMs = performance.now() - start;
        self.postMessage({
            requestId, action, ok: true,
            data: { id: payload.datasetId, columns: data.Columns, rowCount: data.Rows.length },
          executionMs,
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "FILTER": {
        const start = performance.now();
        const data = datasets[payload.datasetId];
        if (!data) throw new Error("dataset not found");
        
        const rules = payload.rules || [];
        if (rules.length === 0) {
            data.Rows = [...data.BaseRows];
        } else {
            data.Rows = applyPipeline(data.BaseRows, rules);
        }
        
        const executionMs = performance.now() - start;
        self.postMessage({
            requestId, action, ok: true,
            data: { id: payload.datasetId, columns: data.Columns, rowCount: data.Rows.length },
          executionMs,
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "GET_DATASET": {
        const data = datasets[payload.datasetId];
        if (!data) throw new Error("dataset not found");
        self.postMessage({
            requestId, action, ok: true,
          data: { id: payload.datasetId, columns: data.Columns, rowCount: data.Rows.length },
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "LIST_DATASETS": {
        self.postMessage({
            requestId, action, ok: true,
          data: Object.keys(datasets),
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "DELETE_DATASET": {
        delete datasets[payload.datasetId];
        self.postMessage({
            requestId, action, ok: true,
          data: "deleted",
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "EXPORT": {
        const data = datasets[payload.datasetId];
        if (!data) throw new Error("dataset not found");
        
        const exportCols = (payload.columns && payload.columns.length > 0) ? payload.columns : data.Columns;
        
        let out = "";
        out += exportCols.map(c => `"${c.replace(/"/g, '""')}"`).join(",") + "\n";
        
        for (const row of data.Rows) {
            out += exportCols.map(c => {
                const val = String(row[c] || "");
                return `"${val.replace(/"/g, '""')}"`;
            }).join(",") + "\n";
        }
        
        self.postMessage({
            requestId, action, ok: true,
          data: out,
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "START_ML_BENCHMARK_JS": {
        const epochs = Number.isFinite(payload.epochs) ? payload.epochs : 10000;
        const learningRate = Number.isFinite(payload.learningRate) ? payload.learningRate : 0.01;

        let experienceArr = payload.experienceArr;
        let salaryArr = payload.salaryArr;

        if (!(experienceArr instanceof Float64Array) || !(salaryArr instanceof Float64Array)) {
          if (Array.isArray(payload.datasetRows)) {
            const prepared = prepareBenchmarkData(payload.datasetRows);
            experienceArr = prepared.experienceArr;
            salaryArr = prepared.salaryArr;
          } else {
            throw new Error("START_ML_BENCHMARK_JS requires datasetRows or Float64Array payloads");
          }
        }

        const start = performance.now();
        const model = trainJS(experienceArr, salaryArr, epochs, learningRate);
        const executionMs = performance.now() - start;

        self.postMessage({
          requestId,
          action,
          ok: true,
          data: {
            rows: experienceArr.length,
            epochs,
            learningRate,
            timingsMs: {
              js: executionMs
            },
            jsModel: model
          },
          executionMs,
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      case "START_GO_FAVOR_BENCHMARK_JS": {
        const rounds = Number.isFinite(payload.rounds) ? payload.rounds : 48;

        let featureArrays = payload.featureArrays;
        if (!featureArrays && payload.datasetId) {
          const data = datasets[payload.datasetId];
          if (!data) throw new Error("dataset not found");
          featureArrays = prepareFeatureArrays(data.Rows || []);
        }
        if (!featureArrays && Array.isArray(payload.datasetRows)) {
          featureArrays = prepareFeatureArrays(payload.datasetRows);
        }
        if (!featureArrays) {
          throw new Error("START_GO_FAVOR_BENCHMARK_JS requires datasetId, datasetRows, or featureArrays");
        }

        const start = performance.now();
        const result = hashFeaturesU64JS(featureArrays, rounds);
        const executionMs = performance.now() - start;

        self.postMessage({
          requestId,
          action,
          ok: true,
          data: {
            rows: result.rows,
            rounds: result.rounds,
            checksum: result.checksum,
            timingsMs: {
              js: executionMs
            }
          },
          executionMs,
          trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
        });
        return;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } catch (error) {
    self.postMessage({
      requestId, action, ok: false,
      error: error instanceof Error ? error.message : String(error),
      trace: { ...traceBase, workerRespondedAtEpoch: Date.now() }
    });
  }
};
