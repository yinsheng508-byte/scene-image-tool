# Font Resource Policy

Bundled font binaries are required for strict packaged font checks, but they are
not part of the first public GitHub source baseline.

Current policy:

- Keep font binaries in the local Windows migration workspace when needed.
- Do not commit font binaries to the public GitHub source repository.
- Use system fonts for early macOS development where possible.
- Restore bundled fonts later through GitHub Releases, an artifact store, or a
  documented provisioning script before running strict packaged font checks.

Provisioning:

- Font requirements are listed in `../resources/runtime-manifest.json`.
- Put the license-reviewed font tree under `/path/to/runtime-artifacts/fonts/`.
- Run `npm --prefix code/desktop run resources:provision:dry-run -- --artifact-root /path/to/runtime-artifacts` from the repository root to inspect missing font files.
- Run `npm --prefix code/desktop run resources:provision -- --artifact bundled-fonts --artifact-root /path/to/runtime-artifacts` only after the font license and artifact source are approved.

Checks that need bundled fonts:

- `npm --prefix code/desktop run font:probe`
- `npm --prefix code/desktop run font:probe:packaged`
