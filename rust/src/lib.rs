use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone)]
struct Dataset {
    columns: Vec<String>,
    base_rows: Vec<Vec<String>>,
    active_indices: Vec<usize>,
}

thread_local! {
    static DATASETS: RefCell<HashMap<String, Dataset>> = RefCell::new(HashMap::new());
}

#[derive(Serialize, Deserialize)]
struct ParseResult {
    id: String,
    columns: Vec<String>,
    #[serde(rename = "rowCount")]
    row_count: usize,
    #[serde(rename = "parseTimeMs")]
    parse_time_ms: f64,
}

#[derive(Serialize, Deserialize)]
struct PageResult {
    id: String,
    columns: Vec<String>,
    #[serde(rename = "rowCount")]
    row_count: usize,
    rows: Vec<HashMap<String, String>>,
}

#[derive(Serialize, Deserialize)]
struct BasicResult {
    id: String,
    columns: Vec<String>,
    #[serde(rename = "rowCount")]
    row_count: usize,
}

#[derive(Deserialize, Debug)]
struct Rule {
    column: String,
    operator: Option<String>,
    value: Option<String>,
    dir: Option<String>,
    logic: Option<String>,
}

#[wasm_bindgen(js_name = parseCSV)]
pub fn parse_csv(csv_text: &str) -> JsValue {
    let mut records = Vec::new();
    let mut row = Vec::new();
    let mut cur = String::with_capacity(128);
    let mut in_quote = false;

    let chars: Vec<char> = csv_text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if in_quote {
            if ch == '"' {
                if i + 1 < chars.len() && chars[i + 1] == '"' {
                    cur.push('"');
                    i += 1;
                } else {
                    in_quote = false;
                }
            } else {
                cur.push(ch);
            }
        } else {
            if ch == '"' {
                in_quote = true;
            } else if ch == ',' {
                row.push(cur.trim().to_string());
                cur.clear();
            } else if ch == '\n' || ch == '\r' {
                if ch == '\r' && i + 1 < chars.len() && chars[i + 1] == '\n' {
                    i += 1;
                }
                row.push(cur.trim().to_string());
                records.push(row.clone());
                row.clear();
                cur.clear();
            } else {
                cur.push(ch);
            }
        }
        i += 1;
    }
    if !cur.is_empty() || !row.is_empty() {
        row.push(cur.trim().to_string());
        records.push(row);
    }

    if records.is_empty() {
        return serde_wasm_bindgen::to_value(&HashMap::from([("error", "Empty CSV")])).unwrap();
    }

    let raw_headers = &records[0];
    let mut headers = Vec::new();
    let mut header_indices = Vec::new();

    for (idx, h) in raw_headers.iter().enumerate() {
        if !h.trim().is_empty() {
            headers.push(h.trim().to_string());
            header_indices.push(idx);
        }
    }

    if headers.is_empty() {
        return serde_wasm_bindgen::to_value(&HashMap::from([("error", "No valid headers found")])).unwrap();
    }

    let mut structured_rows = Vec::with_capacity(records.len().saturating_sub(1));
    for i in 1..records.len() {
        let record = &records[i];
        let mut is_empty_row = true;
        for field in record {
            if !field.trim().is_empty() {
                is_empty_row = false;
                break;
            }
        }
        if is_empty_row {
            continue;
        }

        let mut row_vec = Vec::with_capacity(header_indices.len());
        for &h_idx in &header_indices {
            let val = if h_idx < record.len() {
                record[h_idx].trim().to_string()
            } else {
                "".to_string()
            };
            row_vec.push(val);
        }
        structured_rows.push(row_vec);
    }

    let count = DATASETS.with(|ds| ds.borrow().len() + 1);
    let dataset_id = format!("dataset_{}", count);
    let row_count = structured_rows.len();
    let active_indices: Vec<usize> = (0..row_count).collect();

    DATASETS.with(|ds| {
        ds.borrow_mut().insert(dataset_id.clone(), Dataset {
            columns: headers.clone(),
            base_rows: structured_rows,
            active_indices,
        });
    });

    let res = ParseResult {
        id: dataset_id,
        columns: headers,
        row_count,
        parse_time_ms: 0.0,
    };

    res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap()
}

#[wasm_bindgen(js_name = getPage)]
pub fn get_page(dataset_id: &str, offset: usize, limit: usize) -> JsValue {
    DATASETS.with(|ds_cell| {
        let ds = ds_cell.borrow();
        if let Some(data) = ds.get(dataset_id) {
            let total = data.active_indices.len();
            let end = std::cmp::min(offset + limit, total);
            let mut page_rows = Vec::with_capacity(end.saturating_sub(offset));
            
            if offset < total {
                for i in offset..end {
                    let mut row_map = HashMap::new();
                    let record = &data.base_rows[data.active_indices[i]];
                    for (col_idx, col_name) in data.columns.iter().enumerate() {
                        row_map.insert(col_name.clone(), record[col_idx].clone());
                    }
                    page_rows.push(row_map);
                }
            }
            
            let res = PageResult {
                id: dataset_id.to_string(),
                columns: data.columns.clone(),
                row_count: total,
                rows: page_rows,
            };
            res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap()
        } else {
            serde_wasm_bindgen::to_value(&HashMap::from([("error", "dataset not found")])).unwrap()
        }
    })
}

#[wasm_bindgen(js_name = sortDataset)]
pub fn sort_dataset(dataset_id: &str, rules_json: &str) -> JsValue {
    let rules: Vec<Rule> = serde_json::from_str(rules_json).unwrap_or_default();
    
    DATASETS.with(|ds_cell| {
        let mut ds_map = ds_cell.borrow_mut();
        if let Some(data) = ds_map.get_mut(dataset_id) {
            if rules.is_empty() {
                let res = BasicResult {
                    id: dataset_id.to_string(),
                    columns: data.columns.clone(),
                    row_count: data.active_indices.len(),
                };
                return res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap();
            }

            // Cache the column index mapping for sorting rules
            let mut resolved_rules = Vec::new();
            for rule in &rules {
                if let Some(idx) = data.columns.iter().position(|c| c == &rule.column) {
                    resolved_rules.push((idx, rule.dir.as_deref().unwrap_or("asc") == "desc"));
                }
            }

            data.active_indices.sort_by(|&a_idx, &b_idx| {
                let a = &data.base_rows[a_idx];
                let b = &data.base_rows[b_idx];

                for &(col_idx, is_desc) in &resolved_rules {
                    let val_a = &a[col_idx];
                    let val_b = &b[col_idx];
                    if val_a == val_b {
                        continue;
                    }

                    if let (Ok(num_a), Ok(num_b)) = (val_a.parse::<f64>(), val_b.parse::<f64>()) {
                        if (num_a - num_b).abs() < f64::EPSILON {
                            continue;
                        }
                        if is_desc {
                            return num_b.partial_cmp(&num_a).unwrap_or(std::cmp::Ordering::Equal);
                        } else {
                            return num_a.partial_cmp(&num_b).unwrap_or(std::cmp::Ordering::Equal);
                        }
                    }

                    // For performance, doing a direct string comparison is faster if we don't need uppercase.
                    // Doing to_uppercase is heavy inside a sort loop.
                    let str_a = val_a.to_uppercase();
                    let str_b = val_b.to_uppercase();
                    if str_a == str_b {
                        continue;
                    }

                    if is_desc {
                        return str_b.cmp(&str_a);
                    } else {
                        return str_a.cmp(&str_b);
                    }
                }
                std::cmp::Ordering::Equal
            });

            let res = BasicResult {
                id: dataset_id.to_string(),
                columns: data.columns.clone(),
                row_count: data.active_indices.len(),
            };
            res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap()
        } else {
            serde_wasm_bindgen::to_value(&HashMap::from([("error", "dataset not found")])).unwrap()
        }
    })
}

fn matches_rule(cell: &str, rule: &Rule) -> bool {
    let cell_lower = cell.to_lowercase();
    let rule_val_lower = rule.value.as_deref().unwrap_or("").to_lowercase();
    let op = rule.operator.as_deref().unwrap_or("");

    match op {
        "eq" => cell_lower == rule_val_lower,
        "neq" => cell_lower != rule_val_lower,
        "contains" => cell_lower.contains(&rule_val_lower),
        "not_contains" => !cell_lower.contains(&rule_val_lower),
        "gt" | "gte" | "lt" | "lte" => {
            if let (Ok(num_cell), Ok(num_rule)) = (cell.parse::<f64>(), rule.value.as_deref().unwrap_or("").parse::<f64>()) {
                match op {
                    "gt" => num_cell > num_rule,
                    "gte" => num_cell >= num_rule,
                    "lt" => num_cell < num_rule,
                    "lte" => num_cell <= num_rule,
                    _ => false,
                }
            } else {
                false
            }
        }
        _ => false,
    }
}

#[wasm_bindgen(js_name = filterDataset)]
pub fn filter_dataset(dataset_id: &str, rules_json: &str) -> JsValue {
    let rules: Vec<Rule> = serde_json::from_str(rules_json).unwrap_or_default();
    
    DATASETS.with(|ds_cell| {
        let mut ds_map = ds_cell.borrow_mut();
        if let Some(data) = ds_map.get_mut(dataset_id) {
            if rules.is_empty() {
                data.active_indices = (0..data.base_rows.len()).collect();
            } else {
                // Map rule columns to indices
                let mut resolved_rules = Vec::new();
                for rule in &rules {
                    if let Some(idx) = data.columns.iter().position(|c| c == &rule.column) {
                        resolved_rules.push((idx, rule));
                    }
                }

                let mut active: Vec<usize> = Vec::new();
                if let Some(&(first_col_idx, first_rule)) = resolved_rules.first() {
                    for (i, row) in data.base_rows.iter().enumerate() {
                        if matches_rule(&row[first_col_idx], first_rule) {
                            active.push(i);
                        }
                    }

                    for &(col_idx, rule) in resolved_rules.iter().skip(1) {
                        if rule.logic.as_deref().unwrap_or("") == "or" {
                            // Using a boolean array mapping is much faster than HashSet
                            let mut active_flags = vec![false; data.base_rows.len()];
                            for &idx in &active {
                                active_flags[idx] = true;
                            }
                            
                            for (i, row) in data.base_rows.iter().enumerate() {
                                if !active_flags[i] {
                                    if matches_rule(&row[col_idx], rule) {
                                        active.push(i);
                                    }
                                }
                            }
                        } else {
                            let mut filtered = Vec::with_capacity(active.len());
                            for &idx in &active {
                                if matches_rule(&data.base_rows[idx][col_idx], rule) {
                                    filtered.push(idx);
                                }
                            }
                            active = filtered;
                        }
                    }
                }
                data.active_indices = active;
            }

            let res = BasicResult {
                id: dataset_id.to_string(),
                columns: data.columns.clone(),
                row_count: data.active_indices.len(),
            };
            res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap()
        } else {
            serde_wasm_bindgen::to_value(&HashMap::from([("error", "dataset not found")])).unwrap()
        }
    })
}

#[wasm_bindgen(js_name = getDataset)]
pub fn get_dataset(dataset_id: &str) -> JsValue {
    DATASETS.with(|ds_cell| {
        let ds = ds_cell.borrow();
        if let Some(data) = ds.get(dataset_id) {
            let res = BasicResult {
                id: dataset_id.to_string(),
                columns: data.columns.clone(),
                row_count: data.active_indices.len(),
            };
            res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap()
        } else {
            serde_wasm_bindgen::to_value(&HashMap::from([("error", "dataset not found")])).unwrap()
        }
    })
}

#[wasm_bindgen(js_name = listDatasets)]
pub fn list_datasets() -> JsValue {
    DATASETS.with(|ds_cell| {
        let ds = ds_cell.borrow();
        let keys: Vec<String> = ds.keys().cloned().collect();
        serde_wasm_bindgen::to_value(&keys).unwrap()
    })
}

#[wasm_bindgen(js_name = deleteDataset)]
pub fn delete_dataset(dataset_id: &str) -> JsValue {
    DATASETS.with(|ds_cell| {
        let mut ds = ds_cell.borrow_mut();
        ds.remove(dataset_id);
        serde_wasm_bindgen::to_value("deleted").unwrap()
    })
}

#[wasm_bindgen(js_name = exportCSV)]
pub fn export_csv(dataset_id: &str, cols_json: &str) -> JsValue {
    let cols: Vec<String> = serde_json::from_str(cols_json).unwrap_or_default();
    
    DATASETS.with(|ds_cell| {
        let ds = ds_cell.borrow();
        if let Some(data) = ds.get(dataset_id) {
            let export_cols = if cols.is_empty() { &data.columns } else { &cols };
            
            // Map column names to indices
            let mut col_indices = Vec::new();
            for col in export_cols {
                if let Some(idx) = data.columns.iter().position(|c| c == col) {
                    col_indices.push(idx);
                }
            }

            // Pre-allocate decent capacity
            let mut out = String::with_capacity(data.active_indices.len() * export_cols.len() * 10);
            
            let header = export_cols.iter()
                .map(|c| format!("\"{}\"", c.replace("\"", "\"\"")))
                .collect::<Vec<_>>()
                .join(",");
            out.push_str(&header);
            out.push('\n');

            for &idx in &data.active_indices {
                let row = &data.base_rows[idx];
                let mut first = true;
                for &col_idx in &col_indices {
                    if !first {
                        out.push(',');
                    }
                    first = false;
                    let val = &row[col_idx];
                    if val.contains('"') || val.contains(',') || val.contains('\n') || val.contains('\r') {
                        out.push('"');
                        out.push_str(&val.replace("\"", "\"\""));
                        out.push('"');
                    } else {
                        out.push_str(val);
                    }
                }
                out.push('\n');
            }

            serde_wasm_bindgen::to_value(&out).unwrap()
        } else {
            serde_wasm_bindgen::to_value(&HashMap::from([("error", "dataset not found")])).unwrap()
        }
    })
}
