# Export Basic Fixtures

This directory contains public, synthetic fixture definitions for macOS LibreOffice export smoke tests.

The smoke script generates tiny DOCX and PPTX files from `manifest.json` into `code/desktop/_test_output/`, then converts them with the detected LibreOffice runtime. Generated Office/PDF/PNG files are intentionally ignored and must not be committed.
