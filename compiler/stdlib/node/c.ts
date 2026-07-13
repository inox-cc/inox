import type { TimerLoweringDependencies as PackageTimerLoweringDependencies } from '../../../stdlib/node/timers/compiler/c.ts'

export {
  emitPreparedTimerCallExpression,
  emitTimerVariableDeclaration,
  isTimerStartCallExpression,
  timerCallbackFunctionType
} from '../../../stdlib/node/timers/compiler/c.ts'

export type TimerLoweringDependencies = PackageTimerLoweringDependencies
