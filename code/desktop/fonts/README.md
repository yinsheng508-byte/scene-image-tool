# Font Resource Policy

Bundled font binaries are required for strict packaged font checks, but they are
not part of the first public GitHub source baseline.

Current policy:

- Keep font binaries in the local Windows migration workspace when needed.
- Do not commit font binaries to the public GitHub source repository.
- Use system fonts for early macOS development where possible.
- Restore bundled fonts later through GitHub Releases, an artifact store, or a
  documented provisioning script before running strict packaged font checks.

Checks that need bundled fonts:

- `npm --prefix code/desktop run font:probe`
- `npm --prefix code/desktop run font:probe:packaged`
