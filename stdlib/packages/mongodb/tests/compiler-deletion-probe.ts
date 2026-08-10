export const compilerLibraryDeletionProbe = {
  source: "import { ObjectId } from 'mongodb'\nnew ObjectId()\n",
  presentDiagnosticCodes: ['INOX_MONGODB_LOOP_BACKEND'],
  absentDiagnosticCodes: ['INOX_UNSUPPORTED_IMPORT_SOURCE', 'INOX_UNKNOWN_NAME']
}
