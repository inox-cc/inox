export const compilerLibraryDeletionProbe = {
  source: "import { ObjectId } from 'mongodb'\nnew ObjectId()\n",
  absentDiagnosticCodes: ['INOX_UNRESOLVED_IMPORT']
}
