import os
from pydicom import read_file
from deid.config import DeidRecipe
from deid.dicom import get_files, get_identifiers, replace_identifiers
import sys

# It's better to install the package in editable mode
# pip install -e .
# if you haven't done that, you will need to add deid to your path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# Load the recipe
try:
    recipe = DeidRecipe(deid="deid/data/deid.tcia")
except Exception as e:
    print(f"Error loading recipe: {e}")
    exit(1)

# Get the DICOM file
dicom_files = ["0002.DCM"]

# Get the identifiers
ids = get_identifiers(dicom_files)

# Create the output directory if it doesn't exist
output_folder = "deid_output"
if not os.path.exists(output_folder):
    os.makedirs(output_folder)

# Replace the identifiers
cleaned_files = replace_identifiers(
    dicom_files=dicom_files, deid=recipe, ids=ids, output_folder=output_folder, overwrite=True
)

# Check the output
if cleaned_files:
    print(f"Successfully de-identified {len(cleaned_files)} files.")
    # You can uncomment the following lines to inspect the header of the cleaned file
    cleaned_file = read_file(cleaned_files[0])
    print(cleaned_file)
else:
    print("De-identification failed.")
