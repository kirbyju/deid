# deid WebAssembly (WASM) Interface

This directory contains a web-based interface for the `deid` library, built using Pyodide to run Python in the browser. This allows for de-identifying DICOM files without the data ever leaving the user's local machine.

## Features

- **Local Processing:** All file processing is done in the browser. No data is uploaded to any server.
- **Directory Selection:** Users can select a directory of DICOM files, and the tool will process all subdirectories.
- **Custom Recipes:** Users can choose from pre-defined `deid` recipes or upload/paste their own.
- **Progress Tracking:** A progress bar keeps the user informed of the de-identification process.
- **Graceful Error Handling:** Files that cannot be processed are skipped, and a log of any errors is included in the output.
- **Streamlined Output:** Processed files are streamed into a `.zip` archive, allowing for the processing of large folders without overwhelming browser memory.

## How to Run

1.  **Navigate to this directory:**
    ```bash
    cd wasm
    ```

2.  **Start the local web server:**
    **Important:** The server must be run from the `wasm` directory as shown below. This ensures that the application can correctly load the default deid recipes.
    ```bash
    python server.py
    ```

3.  **Open the web interface:**
    Open your web browser and go to `http://localhost:8000`.

## Technical Details

-   **Pyodide:** The core of this application is Pyodide, which allows us to run the Python `deid` library directly in the browser.
-   **StreamSaver.js:** To handle potentially large volumes of data, we use StreamSaver.js. This allows us to stream the processed files directly into a zip archive on the user's disk, avoiding the memory limitations of the browser.
-   **fflate:** This library is used for fast and efficient zip file creation, which works well with the streaming approach.
-   **Web Workers (Implicitly via Pyodide):** Pyodide runs the Python code in a separate web worker, ensuring that the user interface remains responsive even during intensive processing.
