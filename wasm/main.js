/**
 * main.js: The core Javascript for the deid web application.
 * This script handles the user interface, Pyodide initialization,
 * and the communication between the browser and the Python de-identification logic.
 */

// Get references to all the UI elements we'll need to interact with.
const recipeSelect = document.getElementById('recipe-select');
const recipeText = document.getElementById('recipe-text');
const recipeFile = document.getElementById('recipe-file');
const dicomFolder = document.getElementById('dicom-folder');
const runButton = document.getElementById('run-button');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// This is the main entry point for our application.
// It sets up the Pyodide environment and attaches event listeners to the UI.
async function main() {
    progressText.textContent = 'Initializing Pyodide...';

    // Load the Pyodide runtime.
    const pyodide = await loadPyodide();

    // Pyodide can't directly install packages with complex dependencies like pydicom.
    progressText.textContent = 'Installing Python packages...';

    // Load the micropip package into the Pyodide environment
    await pyodide.loadPackage('micropip');

    // Run the install from inside Python
    await pyodide.runPythonAsync(`
    import micropip
    # Install the essential dependencies, including the local wheel for deid
    await micropip.install(['pydicom', 'python-dateutil', 'numpy', './deid-0.4.8-py3-none-any.whl'])
    `);

    // Load our custom Python script into the Pyodide environment.
    const deidWasmCode = await fetch('deid-wasm.py').then(res => res.text());
    pyodide.runPython(deidWasmCode);

    progressText.textContent = 'Ready to de-identify files.';

    // Attach an event listener to the "Run deid" button.
    runButton.addEventListener('click', async () => {
        // Disable the button to prevent multiple runs at the same time.
        runButton.disabled = true;
        progressText.textContent = 'Starting...';

        // Get the de-identification recipe from the textarea.
        const recipe = recipeText.value;

        // Get the list of files selected by the user.
        const files = dicomFolder.files;
        const totalFiles = files.length;

        // Calculate the total size of the selected files.
        let totalSize = 0;
        for (let i = 0; i < totalFiles; i++) {
            totalSize += files[i].size;
        }

        // Display a confirmation dialog to the user.
        const confirmation = confirm(`You are about to process ${totalFiles} files, with a total size of ${(totalSize / 1024 / 1024).toFixed(2)} MB. Please ensure you have enough disk space before proceeding.`);
        if (!confirmation) {
            runButton.disabled = false;
            progressText.textContent = 'Ready to de-identify files.';
            return;
        }

        progressBar.max = totalFiles;
        progressBar.value = 0;

        // Create a writable stream to save the output zip file directly to disk.
        // This is crucial for handling large amounts of data without running out of memory.
        const fileStream = streamSaver.createWriteStream('deid-output.zip');
        const writer = fileStream.getWriter();

        // Use fflate to create a zip archive on the fly.
        const zip = new fflate.Zip((err, data, final) => {
            if (!err) {
                writer.write(data);
                if (final) {
                    writer.close();
                }
            }
        });

        // Keep track of any errors that occur during processing.
        let errorLog = '';

        // Process each file one by one.
        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            progressText.textContent = `Processing ${file.webkitRelativePath}...`;
            progressBar.value = i + 1;

            // Read the file content as an ArrayBuffer.
            const fileContent = await file.arrayBuffer();

            // Call the Python function to de-identify the file.
            // We pass the file content, recipe, and path to the Python side.
            const result = pyodide.globals.get('deidentify_file')(new Uint8Array(fileContent), recipe, file.webkitRelativePath).toJs();

            // Check if the de-identification was successful.
            if (result.get('success')) {
                // If successful, add the cleaned file to the zip archive.
                const cleanedFile = new fflate.ZipPassThrough(result.get('path'));
                zip.add(cleanedFile);
                cleanedFile.push(result.get('content'));
                cleanedFile.end();
            } else {
                // If there was an error, append it to the error log.
                errorLog += result.get('error') + '\n\n';
            }
        }

        // If there were any errors, add the error log to the zip archive.
        if (errorLog) {
            const errorFile = new fflate.ZipPassThrough('deid-errors.log');
            zip.add(errorFile);
            errorFile.push(new TextEncoder().encode(errorLog));
            errorFile.end();
        }

        // Finalize the zip archive.
        zip.end();
        progressText.textContent = 'Done!';
        runButton.disabled = false;
    });

    // Function to load the content of the selected default recipe into the textarea.
    const loadRecipe = async () => {
        const recipeName = recipeSelect.value;
        const response = await fetch(`../examples/deid/${recipeName}`);
        if (response.ok) {
            const text = await response.text();
            recipeText.value = text;
        } else {
            console.error(`Failed to load recipe: ${recipeName}`);
            recipeText.value = `# Failed to load recipe: ${recipeName}\n# Please check that the server is run from the repository root.`;
        }
    };

    // Attach event listeners for recipe selection and file upload.
    recipeSelect.addEventListener('change', loadRecipe);
    recipeFile.addEventListener('change', () => {
        const reader = new FileReader();
        reader.onload = (e) => recipeText.value = e.target.result;
        reader.readAsText(recipeFile.files[0]);
    });

    // Load the default recipe when the page loads.
    loadRecipe();
}

// Start the application.
main();
