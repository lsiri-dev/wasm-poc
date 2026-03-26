/* tslint:disable */
/* eslint-disable */

export function deleteDataset(dataset_id: string): any;

export function exportCSV(dataset_id: string, cols_json: string): any;

export function filterDataset(dataset_id: string, rules_json: string): any;

export function getDataset(dataset_id: string): any;

export function getPage(dataset_id: string, offset: number, limit: number): any;

export function listDatasets(): any;

export function parseCSV(csv_text: string): any;

export function sortDataset(dataset_id: string, rules_json: string): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly deleteDataset: (a: number, b: number) => any;
    readonly exportCSV: (a: number, b: number, c: number, d: number) => any;
    readonly filterDataset: (a: number, b: number, c: number, d: number) => any;
    readonly getDataset: (a: number, b: number) => any;
    readonly getPage: (a: number, b: number, c: number, d: number) => any;
    readonly listDatasets: () => any;
    readonly parseCSV: (a: number, b: number) => any;
    readonly sortDataset: (a: number, b: number, c: number, d: number) => any;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
