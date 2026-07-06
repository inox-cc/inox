export type { FetchLoweringDependencies } from '../fetch/compiler/c.ts'
export type { JsonClassInstanceOperand, JsonDeclarationDependencies } from '../json/compiler/c.ts'
export type { TimeLoweringDependencies } from '../time/compiler/c.ts'
export { irProgramsUseConsoleRuntime, isConsoleLog } from '../console/compiler/c.ts'
export { cDebugRuntimeMethodName } from '../debug/compiler/c.ts'
export {
  cFetchRuntimeExpressionMethod,
  emitFetchStringArgument,
  emitFetchHeadersBooleanVariableDeclaration,
  emitPreparedFetchCallExpression,
  emitPreparedFetchHeadersCallExpression,
  emitPreparedFetchInitOperand,
  isAsyncFetchRuntimeCallExpression
} from '../fetch/compiler/c.ts'
export {
  cJsonRuntimeCallName,
  emitJsonParseVariableDeclaration,
  emitPreparedJsonCallExpression,
  emitPreparedJsonScalarParseExpression
} from '../json/compiler/c.ts'
export {
  cTimeRuntimeCallName,
  emitPreparedDateNumberExpression,
  emitPreparedDateStringExpression,
  isDateStringExpression
} from '../time/compiler/c.ts'
