import { useCallback, useEffect, useRef, useState } from "react"

export function useJsWorker() {
  const workerRef = useRef(null)
  const pendingRef = useRef(new Map())
  const reqIdRef = useRef(0)
  const abortControllerRef = useRef(null)

  const [isReady, setIsReady] = useState(false)
  const [initError, setInitError] = useState("")

  const postAction = useCallback((action, payload = {}) => {
    if (!workerRef.current) {
      return Promise.reject(new Error("Worker is not initialized"))
    }

    // Reject if abort was signaled
    if (abortControllerRef.current?.signal.aborted) {
      return Promise.reject(new Error("Worker has been cleaned up"))
    }

    reqIdRef.current += 1
    const requestId = reqIdRef.current
    const signal = abortControllerRef.current?.signal

    return new Promise((resolve, reject) => {
      // Register abort listener for this specific request
      const handleAbort = () => {
        pendingRef.current.delete(requestId)
        reject(new Error("Request aborted"))
      }

      if (signal) {
        signal.addEventListener("abort", handleAbort, { once: true })
      }

      pendingRef.current.set(requestId, { resolve, reject, signal, handleAbort })
      workerRef.current.postMessage({ requestId, action, payload })
    })
  }, [])

  useEffect(() => {
    // Create fresh abort controller for this mount
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const worker = new Worker("/js.worker.js")
    workerRef.current = worker

    worker.onmessage = (event) => {
      // Ignore messages if this mount has been aborted
      if (signal.aborted) {
        return
      }

      const { requestId, ok, action, data, error, executionMs } = event.data || {}
      if (requestId == null) {
        return
      }

      const pending = pendingRef.current.get(requestId)
      if (!pending) {
        return
      }

      // Clean up abort listener
      if (pending.signal) {
        pending.signal.removeEventListener("abort", pending.handleAbort)
      }
      pendingRef.current.delete(requestId)

      if (ok === false) {
        pending.reject(new Error(error || `Worker action failed: ${action}`))
        return
      }

      pending.resolve({ action, data, executionMs })
    }

    worker.onerror = (event) => {
      if (!signal.aborted) {
        setInitError(event.message || "Worker crashed")
      }
    }

    ;(async () => {
      try {
        await postAction("INIT")
        if (!signal.aborted) {
          setIsReady(true)
        }
      } catch (error) {
        if (!signal.aborted) {
          setInitError(error.message || "Failed to initialize JS worker")
        }
      }
    })()

    return () => {
      // Signal cleanup: abort all pending requests
      abortControllerRef.current.abort()

      // Clean up abort listeners
      for (const [, pending] of pendingRef.current) {
        if (pending.signal && pending.handleAbort) {
          pending.signal.removeEventListener("abort", pending.handleAbort)
        }
      }
      pendingRef.current.clear()

      worker.terminate()
      workerRef.current = null
    }
  }, [postAction])

  return {
    isReady,
    initError,
    postAction
  }
}
