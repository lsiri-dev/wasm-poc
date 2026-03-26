# Performance Comparison Report: JavaScript vs Go WebAssembly

## Purpose
This report summarizes benchmark findings for the same frontend application running equivalent tasks in:
- JavaScript worker
- Go WebAssembly worker

The goal is to provide a technically correct demo narrative for the team: where JS wins, where Go/WASM wins, and why.

---

## Benchmark Scope
Two benchmark classes were measured:

1. **CSV app operations**
   - Parse
   - Sort
   - Filter

2. **Dedicated compute benchmarks**
   - **U64 Feature Hash (Go-favor kernel)**
   - **Linear Regression (Gradient Descent)**

All runs were executed through workers with timing breakdown instrumentation.

---

## What We Are Computing (and How)

This comparison is not just “run code and time it”. Each benchmark computes a deterministic output from the same dataset so we can verify both correctness and speed.

### A) Linear Regression (Gradient Descent)

Input columns used:
- `experience`
- `salary_usd`

Pipeline:
1. Extract numeric arrays from dataset rows.
2. Normalize both arrays to `[0, 1]` range.
3. Train model with batch gradient descent for fixed epochs.

Model:
- Prediction: `y_hat = m * x + b`
- Parameters learned: slope `m`, intercept `b`

Per epoch:
1. Loop over all rows.
2. Compute error term `((m*x + b) - y)`.
3. Accumulate gradients for `m` and `b`.
4. Update `m` and `b` once at epoch end.

Output used for correctness check:
- Final `m`
- Final `b`

Why this benchmark matters:
- Heavy floating-point arithmetic with many repeated iterations.
- Good for testing numeric loop performance and JIT/AOT behavior.

### B) U64 Feature Hash (Go-favor kernel)

Input columns used:
- `experience`
- `country_id`
- `education_level`
- `lang_count`
- `framework_count`
- `company_size`

Pipeline:
1. Convert each feature to integer representation (`Uint32` domain).
2. Pack features into a 64-bit composite value per row.
3. Apply 64-bit mix function over multiple rounds.
4. Fold all row hashes into a final accumulator.

Output used for correctness check:
- Final hex checksum (must match across JS and Go paths)

Why this benchmark matters:
- Heavy integer + bitwise + 64-bit mixing workload.
- Strong signal for kernels where Wasm/native integer processing can outperform JS BigInt-heavy loops.

### Why two benchmarks are necessary

Using both benchmarks gives an honest comparison:
- Regression shows behavior on float-heavy ML-style loops.
- U64 hash shows behavior on integer/bit-mixing compute kernels.

This avoids a biased conclusion like “one engine always wins”.

---

## Timing Definitions
To avoid confusion, these metrics are reported:

- **Worker Compute**: measured compute section only (`performance.now()` in worker action)
- **Round-trip**: request send to response receive at hook level
- **End-to-end**: button click path to result state update in UI component

For CSV operations, additional breakdown is shown:
- **in**: main thread → worker transfer/queue delay
- **worker total**: worker receive → worker respond
- **worker overhead**: worker total - worker compute
- **out**: worker respond → main thread receive

---

## Results

## 1) CSV App Operations (JS sample)
Observed values:

- Parse: `333.00 ms`
- Sort: `171.30 ms`
- Filter: `14.20 ms`

Breakdown sample:
- Parse: in `8.00 ms` | worker total `333.00 ms` | compute `333.00 ms` | out `1.00 ms` | roundtrip `342.00 ms`
- Sort: in `1.00 ms` | worker total `171.00 ms` | compute `171.30 ms` | out `0.00 ms` | roundtrip `172.00 ms`
- Filter: in `0.00 ms` | worker total `14.00 ms` | compute `14.20 ms` | out `6.00 ms` | roundtrip `20.00 ms`

Interpretation:
- For these operations, **compute dominates**.
- Transport overhead is relatively small in this sample.
- JS is strong on string/object-heavy parse/sort/filter pipelines.

---

## 2) U64 Feature Hash (Go-favor kernel)

### JavaScript
- Worker Compute: `3936.30 ms`
- Round-trip: `3972.10 ms`
- End-to-end: `3972.10 ms`
- Checksum: `1b568092a79b2337`

### Go WASM
- Worker Compute: `564.40 ms`
- Round-trip: `564.70 ms`
- End-to-end: `564.80 ms`
- Checksum: `1b568092a79b2337`

### Comparison
- **Winner: Go WASM**
- Speedup (compute): approximately `3936.30 / 564.40 ≈ 6.97x`
- Correctness: checksum matches exactly.

Interpretation:
- This kernel is integer/bit-mixing heavy and favors native-style Wasm execution.
- JS path uses BigInt-heavy operations, which are significantly slower for this pattern.

---

## 3) Linear Regression (Gradient Descent)

### JavaScript
- Worker Compute: `3590.90 ms`
- Round-trip: `4057.70 ms`
- End-to-end: `4484.70 ms`
- m: `0.45533219`
- b: `0.22453813`

### Go WASM
- Worker Compute: `7981.30 ms`
- Round-trip: `8354.50 ms`
- End-to-end: `17007.10 ms`
- m: `0.45533219`
- b: `0.22453813`

### Comparison
- **Winner: JavaScript**
- JS faster on compute by approximately `7981.30 / 3590.90 ≈ 2.22x`
- Correctness: model parameters match exactly.

Interpretation:
- JS JIT is very effective for typed-array floating-point loops.
- Go/WASM path still incurs substantial per-run preparation/runtime costs for this workload pattern.

---

## Key Takeaways for Team

1. **WASM is not universally faster than JS.**
2. Performance depends on workload shape:
   - JS wins for current float-heavy linear regression path.
   - Go/WASM wins strongly for integer/bit-mixing kernel.
3. Correctness is validated in both cases:
   - Matching checksum for hash benchmark.
   - Matching `m`/`b` for regression benchmark.
4. Timing now includes sufficient visibility to separate compute from transport/overhead.

---

## Recommended Demo Narrative

Use a two-part story:

1. **Real app operations (parse/sort/filter):**
   - Show practical UX timings.
   - Explain that JS can be very competitive for object/string pipelines.

2. **Compute kernel benchmark (U64 hash):**
   - Show where Go/WASM clearly wins (~7x in measured compute).
   - Highlight workload-dependent architecture decisions.

Suggested conclusion line:
> “For our app, we should choose engine per workload: JS for some data pipeline steps, Go/WASM for specific compute kernels where it provides clear gains.”

---

## Benchmark Hygiene Checklist (for repeatable demos)

- Use same dataset and same worker mode each run.
- Run each benchmark at least 3 times; compare median.
- Avoid running “both” mode when demonstrating per-engine absolute latency.
- Keep browser tabs/process load stable.
- Report all three metrics (Compute, Round-trip, End-to-end).

---

## Appendix: Why small timing inconsistencies can appear

You may occasionally see tiny mismatches like:
- compute slightly greater than worker total
- 0.00 ms for in/out

These are measurement granularity/artifact effects from mixed timestamp sources and scheduling precision, not logical errors.
