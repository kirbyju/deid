// DOM Elements
const dicomFileInput = document.getElementById('dicom-file');
const deidRecipeTextarea = document.getElementById('deid-recipe');
const runButton = document.getElementById('run-button');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const errorLogPre = document.getElementById('error-log');
const dropZone = document.getElementById('drop-zone');
const recipeSelect = document.getElementById('recipe-select');
const recipeFileInput = document.getElementById('recipe-file');

let pyodide;
let selectedFiles = [];

// --- Initialization ---

async function main() {
    statusDiv.textContent = 'Loading Pyodide...';
    pyodide = await loadPyodide();
    statusDiv.textContent = 'Pyodide loaded. Installing deid...';

    await pyodide.loadPackage('micropip');
    const micropip = pyodide.pyimport('micropip');

    await micropip.install([
        'deid-0.4.7-py3-none-any.whl',
        'pydicom',
    ]);

    await populateRecipes();
    statusDiv.textContent = 'Ready. Please select a DICOM folder and a recipe.';
}

async function populateRecipes() {
    // This Python script gets the built-in recipes from the installed deid package
    const pythonCode = `
import os
import json
from deid.utils import get_installdir

def get_deid_recipes():
    recipe_dir = os.path.join(get_installdir(), 'data')
    recipes = {}
    if os.path.exists(recipe_dir):
        for filename in sorted(os.listdir(recipe_dir)):
            if filename.startswith('deid.dicom'):
                filepath = os.path.join(recipe_dir, filename)
                with open(filepath, 'r') as f:
                    recipes[filename] = f.read()
    return json.dumps(recipes)

get_deid_recipes()
    `;
    const recipesJson = await pyodide.runPythonAsync(pythonCode);
    const recipes = JSON.parse(recipesJson);

    for (const name in recipes) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        recipeSelect.appendChild(option);
    }

    recipeSelect.addEventListener('change', () => {
        const selectedRecipe = recipeSelect.value;
        if (selectedRecipe && recipes[selectedRecipe]) {
            deidRecipeTextarea.value = recipes[selectedRecipe];
            recipeFileInput.value = ''; // Clear file input
        }
    });
}

// --- Event Handlers ---

runButton.addEventListener('click', processFilesWithStreaming);
recipeFileInput.addEventListener('change', handleRecipeFileUpload);
dropZone.addEventListener('click', () => dicomFileInput.click());
dicomFileInput.addEventListener('change', (e) => handleFileSelection(e.target.files));

['dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (eventName === 'dragover') dropZone.classList.add('hover');
        else dropZone.classList.remove('hover');
        if (eventName === 'drop') handleFileSelection(e.dataTransfer.files);
    });
});

function handleFileSelection(files) {
    if (files.length > 0) {
        selectedFiles = Array.from(files);
        dropZone.textContent = `${selectedFiles.length} file(s) selected from folder "${selectedFiles[0].webkitRelativePath.split('/')[0]}".`;
    }
}

function handleRecipeFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            deidRecipeTextarea.value = e.target.result;
            recipeSelect.value = ""; // Reset dropdown
        };
        reader.readAsText(file);
    }
}

// --- Core Logic with Streaming ---

async function processFilesWithStreaming() {
    const deidRecipe = deidRecipeTextarea.value;

    if (selectedFiles.length === 0 || !deidRecipe) {
        statusDiv.textContent = 'Error: Please select a folder and provide a recipe.';
        return;
    }

    runButton.disabled = true;
    errorLogPre.textContent = '';
    let errorLog = "";
    let filesProcessed = 0;

    // 1. Prepare for streaming
    const fileStream = streamSaver.createWriteStream('deidentified_dicom.zip');
    const zipStream = new fflate.Zip((err, data, final) => {
        if (!err) {
            writer.write(data);
            if (final) {
                writer.close();
            }
        } else {
            writer.abort(err);
        }
    });
    const writer = fileStream.getWriter();

    // 2. Prepare Python function for single file processing
    const pythonCode = `
import sys
import os
from deid.main import main

def process_single_file(input_path, recipe_content):
    output_path = "cleaned_temp.dcm"
    recipe_path = "deid.recipe"

    with open(recipe_path, 'w') as f:
        f.write(recipe_content)

    sys.argv = ['deid', 'clean', '--deid', recipe_path, input_path, output_path]

    try:
        main()
        if os.path.exists(output_path):
            with open(output_path, 'rb') as f:
                return f.read()
    except Exception as e:
        return str(e)
    finally:
        # Clean up virtual files
        if os.path.exists(input_path): os.remove(input_path)
        if os.path.exists(output_path): os.remove(output_path)
        if os.path.exists(recipe_path): os.remove(recipe_path)
    `;
    await pyodide.runPythonAsync(pythonCode);
    const process_single_file = pyodide.globals.get('process_single_file');

    // 3. Process files one by one and stream to zip
    for (const file of selectedFiles) {
        const filePath = file.webkitRelativePath;
        statusDiv.textContent = `Processing: ${filePath}`;

        // Write file to virtual FS
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        pyodide.FS.writeFile(filePath, data);

        const result = await process_single_file(filePath, deidRecipe);

        if (result instanceof Uint8Array) {
            const zipFile = new fflate.ZipPassThrough(filePath);
            zipStream.add(zipFile);
            zipFile.push(result);
            zipFile.push(new Uint8Array(0), true); // Final chunk
        } else {
            const errorMessage = `Error processing ${filePath}: ${result}`;
            console.error(errorMessage);
            errorLog += errorMessage + '\n\n';
        }

        filesProcessed++;
        const progress = Math.round((filesProcessed / selectedFiles.length) * 100);
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${progress}%`;
    }

    // 4. Finalize
    if (errorLog) {
        const errorFile = new fflate.ZipPassThrough('processing_errors.log');
        zipStream.add(errorFile);
        errorFile.push(new TextEncoder().encode(errorLog));
        errorFile.push(new Uint8Array(0), true);
        errorLogPre.textContent = errorLog;
    }

    zipStream.end();
    statusDiv.textContent = `Processing complete. Zip file saved. ${filesProcessed - errorLog.split('\n\n').filter(Boolean).length}/${filesProcessed} files successful.`;
    runButton.disabled = false;
}

// --- Start the application ---
main();
