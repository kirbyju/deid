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
        'numpy',
        'python-dateutil'
    ]);

    await populateRecipes();
    statusDiv.textContent = 'Ready. Please select a DICOM folder and a recipe.';
}

async function populateRecipes() {
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
            recipeFileInput.value = '';
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
        if (eventName === 'drop') handleDrop(e);
    });
});

async function handleDrop(e) {
    const items = e.dataTransfer.items;
    const files = [];
    const promises = [];

    for (const item of items) {
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                promises.push(traverseFileTree(entry, files));
            }
        }
    }

    await Promise.all(promises);
    handleFileSelection(files);
}

function traverseFileTree(entry, files) {
    return new Promise(resolve => {
        if (entry.isFile) {
            entry.file(file => {
                file.webkitRelativePath = entry.fullPath.substring(1);
                files.push(file);
                resolve();
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readEntries = () => {
                dirReader.readEntries(async (entries) => {
                    if (entries.length > 0) {
                        const promises = [];
                        for (const subEntry of entries) {
                            promises.push(traverseFileTree(subEntry, files));
                        }
                        await Promise.all(promises);
                        readEntries();
                    } else {
                        resolve();
                    }
                });
            };
            readEntries();
        }
    });
}


function handleFileSelection(files) {
    if (files.length > 0) {
        selectedFiles = files;
        const firstPath = files[0].webkitRelativePath || files[0].name;
        const folderName = firstPath.split('/')[0];
        dropZone.textContent = `(${files.length}) files selected from folder "${folderName}".`;
    }
}


function handleRecipeFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            deidRecipeTextarea.value = e.target.result;
            recipeSelect.value = "";
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

    const fileStream = streamSaver.createWriteStream('deidentified_dicom.zip');
    const zipStream = new fflate.Zip((err, data, final) => {
        if (!err) {
            writer.write(data);
            if (final) writer.close();
        } else {
            writer.abort(err);
        }
    });
    const writer = fileStream.getWriter();

    const pythonCode = `
import sys
import os
import shutil
from deid.dicom import clean_dicom_files

def process_single_file(input_path, recipe_content):
    output_dir = "/cleaned"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    recipe_path = "deid.recipe"
    with open(recipe_path, 'w') as f:
        f.write(recipe_content)

    try:
        cleaned_files = clean_dicom_files(
            dicom_files=[input_path],
            deid=recipe_path,
            output_folder=output_dir,
            force=True
        )

        if cleaned_files:
            output_path = cleaned_files[0]
            if os.path.exists(output_path):
                with open(output_path, 'rb') as f:
                    return f.read()
        return "Error: Cleaned file not found."

    except Exception as e:
        return f"Error: {str(e)}"
    finally:
        # Clean up virtual files
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(recipe_path):
            os.remove(recipe_path)
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
    `;
    await pyodide.runPythonAsync(pythonCode);
    const process_single_file = pyodide.globals.get('process_single_file');

    for (const file of selectedFiles) {
        const filePath = file.webkitRelativePath || file.name;
        statusDiv.textContent = `Processing: ${filePath}`;

        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);

        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dir) {
            pyodide.FS.mkdirTree(dir);
        }
        pyodide.FS.writeFile(filePath, data);

        const result = await process_single_file(filePath, deidRecipe);

        if (result instanceof Uint8Array) {
            const zipFile = new fflate.ZipPassThrough(filePath);
            zipStream.add(zipFile);
            zipFile.push(result);
            zipFile.push(new Uint8Array(0), true);
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
