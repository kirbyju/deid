# Deid WASM Interface

This directory contains a WebAssembly (WASM) interface for the `deid` library, allowing you to run deid recipes against your data locally in your browser without needing to install any software.

## How to Run

1. **Navigate to the `wasm` directory:**
   ```bash
   cd wasm
   ```

2. **Start the web server:**
   ```bash
   python server.py
   ```

3. **Open your browser:**
   Navigate to `http://localhost:8000` in your web browser.

## How to Use

1. **Upload a DICOM file:**
   Drag and drop a DICOM file onto the designated area, or click to select a file from your computer.

2. **Enter a deid recipe:**
   Paste your deid recipe into the text area.

3. **Run deid:**
   Click the "Run Deid" button to process the file.

4. **Download the cleaned file:**
   A download link for the cleaned DICOM file will appear in the results section.
