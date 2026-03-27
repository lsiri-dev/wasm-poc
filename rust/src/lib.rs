use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone)]
struct Dataset {
    columns: Vec<String>,
    rows: Vec<HashMap<String, String>>,
    base_rows: Vec<HashMap<String, String>>,
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
    // Basic CSV parser
    let mut records = Vec::new();
    let mut row = Vec::new();
    let mut cur = String::new();
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

    let mut structured_rows = Vec::new();
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

        let mut row_map = HashMap::new();
        for (col_idx, &h_idx) in header_indices.iter().enumerate() {
            let val = if h_idx < record.len() {
                record[h_idx].trim().to_string()
            } else {
                "".to_string()
            };
            row_map.insert(headers[col_idx].clone(), val);
        }
        structured_rows.push(row_map);
    }

    let count = DATASETS.with(|ds| ds.borrow().len() + 1);
    let dataset_id = format!("dataset_{}", count);

    let row_count = structured_rows.len();
    DATASETS.with(|ds| {
        ds.borrow_mut().insert(dataset_id.clone(), Dataset {
            columns: headers.clone(),
            base_rows: structured_rows.clone(),
            rows: structured_rows,
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
            let total = data.rows.len();
            let end = std::cmp::min(offset + limit, total);
            let page_rows = if offset < total {
                data.rows[offset..end].to_vec()
            } else {
                Vec::new()
            };
            
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
                    row_count: data.rows.len(),
                };
                return res.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap();
            }

            data.rows.sort_by(|a, b| {
                for rule in &rules {
                    let col = &rule.column;
                    let val_a = a.get(col).cloned().unwrap_or_default();
                    let val_b = b.get(col).cloned().unwrap_or_default();
                    if val_a == val_b {
                        continue;
                    }

                    if let (Ok(num_a), Ok(num_b)) = (val_a.parse::<f64>(), val_b.parse::<f64>()) {
                        if (num_a - num_b).abs() < f64::EPSILON {
                            continue;
                        }
                        let dir = rule.dir.as_deref().unwrap_or("asc");
                        if dir == "desc" {
                            return num_b.partial_cmp(&num_a).unwrap_or(std::cmp::Ordering::Equal);
                        } else {
                            return num_a.partial_cmp(&num_b).unwrap_or(std::cmp::Ordering::Equal);
                        }
                    }

                    let str_a = val_a.to_uppercase();
                    let str_b = val_b.to_uppercase();
                    if str_a == str_b {
                        continue;
                    }

                    let dir = rule.dir.as_deref().unwrap_or("asc");
                    if dir == "desc" {
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
                row_count: data.rows.len(),
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
                data.rows = data.base_rows.clone();
            } else {
                let all = &data.base_rows;
                let mut active: Vec<usize> = Vec::new();
                let first = &rules[0];
                for (i, row) in all.iter().enumerate() {
                    let cell = row.get(&first.column).cloned().unwrap_or_default();
                    if matches_rule(&cell, first) {
                        active.push(i);
                    }
                }

                for j in 1..rules.len() {
                    let rule = &rules[j];
                    if rule.logic.as_deref().unwrap_or("") == "or" {
                        let active_set: std::collections::HashSet<_> = active.iter().cloned().collect();
                        for (i, row) in all.iter().enumerate() {
                            if !active_set.contains(&i) {
                                let cell = row.get(&rule.column).cloned().unwrap_or_default();
                                if matches_rule(&cell, rule) {
                                    active.push(i);
                                }
                            }
                        }
                    } else {
                        let mut filtered = Vec::new();
                        for &idx in &active {
                            let cell = all[idx].get(&rule.column).cloned().unwrap_or_default();
                            if matches_rule(&cell, rule) {
                                filtered.push(idx);
                            }
                        }
                        active = filtered;
                    }
                }

                data.rows = active.into_iter().map(|idx| all[idx].clone()).collect();
            }

            let res = BasicResult {
                id: dataset_id.to_string(),
                columns: data.columns.clone(),
                row_count: data.rows.len(),
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
                row_count: data.rows.len(),
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
            let mut out = String::new();
            
            let header = export_cols.iter()
                .map(|c| format!("\"{}\"", c.replace("\"", "\"\"")))
                .collect::<Vec<_>>()
                .join(",");
            out.push_str(&header);
            out.push('\n');

            for row in &data.rows {
                let line = export_cols.iter()
                    .map(|c| {
                        let val = row.get(c).cloned().unwrap_or_default();
                        format!("\"{}\"", val.replace("\"", "\"\""))
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                out.push_str(&line);
                out.push('\n');
            }

            serde_wasm_bindgen::to_value(&out).unwrap()
        } else {
            serde_wasm_bindgen::to_value(&HashMap::from([("error", "dataset not found")])).unwrap()
        }
    })
}

#[wasm_bindgen(js_name = factorial)]
pub fn factorial(n: u32) -> f64 {
    let mut result: f64 = 1.0;
    for i in 1..=n {
        result *= i as f64;
    }
    result
}
