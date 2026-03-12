import React from "react"

export default function CSVUploader() {

  const handleUpload = async (e) => {
    const file = e.target.files[0]

    if (!file) return

    const text = await file.text()

    window.parseCSV(text)
  }

  return (
    <div>
      <h2>Upload CSV</h2>
      <input type="file" accept=".csv" onChange={handleUpload} />
    </div>
  )
}