"""
deid-wasm.py: Core Python logic for de-identifying DICOM files in a Pyodide environment.
This script is intended to be loaded and called from Javascript in a web browser.
"""

import io
import traceback

# Pyodide provides the `js` module to interact with Javascript.
import js

# These are the core libraries for DICOM processing and de-identification.
# They will be installed by Pyodide using micropip.
import pydicom
from deid.config import DeidRecipe
from deid.dicom.actions import apply_actions


def deidentify_file(file_bytes, recipe_text, file_path):
    """
    De-identifies a single DICOM file.

    Args:
        file_bytes (bytes): The raw byte content of the DICOM file.
        recipe_text (str): The deid recipe as a string.
        file_path (str): The original relative path of the file, for logging.

    Returns:
        A dictionary containing the result of the de-identification.
        On success: {"success": True, "content": <Uint8Array of cleaned file>, "path": <original path>, "error": None}
        On failure: {"success": False, "content": None, "path": <original path>, "error": <error message>}
    """
    try:
        # Load the deid recipe from the provided text.
        recipe = DeidRecipe(recipe_text)

        # Create a file-like object from the input bytes.
        dicom_file = io.BytesIO(file_bytes)

        # Read the DICOM dataset. `force=True` helps with non-standard files.
        dataset = pydicom.dcmread(dicom_file, force=True)

        # Apply the de-identification actions based on the recipe.
        cleaned_dataset, _ = apply_actions(dataset=dataset, deid=recipe)

        # Save the modified dataset to an in-memory buffer.
        output_buffer = io.BytesIO()
        cleaned_dataset.save_as(output_buffer)
        cleaned_bytes = output_buffer.getvalue()

        # Return the result in a format that Javascript can handle.
        # We convert the bytes to a Uint8Array for easy handling in JS.
        return {
            "success": True,
            "content": js.Uint8Array.new(cleaned_bytes),
            "path": file_path,
            "error": None
        }
    except Exception as e:
        # If anything goes wrong, catch the exception and return an error message.
        error_message = f"Failed to process {file_path}:\n{str(e)}\n{traceback.format_exc()}"
        return {
            "success": False,
            "content": None,
            "path": file_path,
            "error": error_message
        }
