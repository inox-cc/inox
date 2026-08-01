export const compilerLibraryDeletionProbe = {
  source: "type Callback = () => string\nlet value: ReturnType<Callback> = 'ok'\nvalue\n",
  absentDiagnosticCodes: ['INOX_UNKNOWN_TYPE']
}
