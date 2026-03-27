const datasets = {};

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
  const { requestId, action, payload = {} } = event.data || {};

  try {
    switch (action) {
      case "INIT": {
        self.postMessage({ requestId, action, ok: true, data: { ready: true } });
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
            executionMs
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
            data: { id: payload.datasetId, columns: data.Columns, rowCount: total, rows: pageRows }
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
                executionMs
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
            executionMs
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
            executionMs
        });
        return;
      }

      case "GET_DATASET": {
        const data = datasets[payload.datasetId];
        if (!data) throw new Error("dataset not found");
        self.postMessage({
            requestId, action, ok: true,
            data: { id: payload.datasetId, columns: data.Columns, rowCount: data.Rows.length }
        });
        return;
      }

      case "LIST_DATASETS": {
        self.postMessage({
            requestId, action, ok: true,
            data: Object.keys(datasets)
        });
        return;
      }

      case "DELETE_DATASET": {
        delete datasets[payload.datasetId];
        self.postMessage({
            requestId, action, ok: true,
            data: "deleted"
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
            data: out
        });
        return;
      }

      case "FACTORIAL": {
        const start = performance.now();
        const n = payload.n || 0;
        let result = 1;
        for (let i = 1; i <= n; i++) {
          result *= i;
        }
        const executionMs = performance.now() - start;
        self.postMessage({
            requestId, action, ok: true,
            data: result,
            executionMs
        });
        return;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } catch (error) {
    self.postMessage({
      requestId, action, ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
