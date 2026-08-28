# Vendor Runtime Policy

This directory is reserved for platform runtime artifacts.

The GitHub-ready public repository must not track:

- `vendor/libreoffice/`
- `vendor/redist/vc_redist.x64.exe`
- installer packages, build outputs, or unpacked runtime dumps

Current strategy:

- Windows development may keep LibreOffice and VC runtime artifacts locally.
- macOS development uses the system LibreOffice installation, for example `/Applications/LibreOffice.app/Contents/MacOS/soffice`.
- Shared source code, checksums, manifests, and download instructions can be tracked.
- Large platform runtime files should be distributed through GitHub Releases or another artifact store.

Provisioning:

- Runtime requirements are listed in `../resources/runtime-manifest.json`.
- Use `npm --prefix code/desktop run resources:provision:dry-run -- --platform win32 --artifact-root /path/to/runtime-artifacts` from the repository root to inspect expected Windows artifacts.
- Use `npm --prefix code/desktop run resources:provision -- --platform win32 --artifact windows-vc-redist-x64 --artifact-root /path/to/runtime-artifacts` to copy and verify a specific artifact.
- The script never downloads artifacts by itself; prepare the local artifact root outside Git first.
