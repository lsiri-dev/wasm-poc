import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const frontendDir = resolve(__dirname, "..")
const repoRoot = resolve(frontendDir, "..")
const wasmDir = join(repoRoot, "wasm")
const rustDir = join(repoRoot, "rust")
const publicDir = join(frontendDir, "public")
const wasmOutput = join(publicDir, "main.wasm")
const rustOutput = join(publicDir, "rust")

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n")
    throw new Error(details || `Command failed: ${command} ${args.join(" ")}`)
  }

  return result.stdout.trim()
}

function printAndExit(message) {
  console.error(`\n[build:wasm] ${message}\n`)
  process.exit(1)
}

try {
  run("go", ["version"])
} catch {
  printAndExit("Go is not installed or not available in PATH. Install Go and restart your terminal.")
}

mkdirSync(publicDir, { recursive: true })

try {
  run("go", ["build", "-o", wasmOutput, "."], {
    cwd: wasmDir,
    env: {
      ...process.env,
      GOOS: "js",
      GOARCH: "wasm",
      CGO_ENABLED: "0"
    }
  })
} catch (error) {
  printAndExit(`WASM build failed. ${error instanceof Error ? error.message : String(error)}`)
}

let goroot = ""
try {
  goroot = run("go", ["env", "GOROOT"])
} catch (error) {
  printAndExit(`Could not read GOROOT. ${error instanceof Error ? error.message : String(error)}`)
}

const wasmExecCandidates = [
  join(goroot, "lib", "wasm", "wasm_exec.js"),
  join(goroot, "misc", "wasm", "wasm_exec.js")
]

const wasmExecSource = wasmExecCandidates.find((candidate) => existsSync(candidate))
if (!wasmExecSource) {
  printAndExit("Could not find wasm_exec.js in GOROOT (checked lib/wasm and misc/wasm).")
}

try {
  copyFileSync(wasmExecSource, join(publicDir, "wasm_exec.js"))
} catch (error) {
  printAndExit(`Failed to copy wasm_exec.js. ${error instanceof Error ? error.message : String(error)}`)
}

console.log("[build:wasm] Built frontend/public/main.wasm")
console.log("[build:wasm] Updated frontend/public/wasm_exec.js")

try {
  if (existsSync(rustDir)) {
    console.log("[build:wasm] Building Rust WASM...")
    run("wasm-pack", ["build", "--target", "web", "--out-dir", rustOutput], {
      cwd: rustDir
    })
    console.log("[build:wasm] Built Rust WASM")
  }
} catch (error) {
  console.error(`[build:wasm] Rust WASM build failed or wasm-pack not found. ${error.message}`)
}

