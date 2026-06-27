import type { CompilerFeatureDescriptor } from '../types.ts'
import { binaryFeature } from './binary.ts'
import { childProcessFeature } from './child-process.ts'
import { clocksFeature } from './clocks.ts'
import { cryptoFeature } from './crypto.ts'
import { debugMemoryFeature } from './debug-memory.ts'
import { fsFeature } from './fs.ts'
import { jsonFeature } from './json.ts'
import { osFeature } from './os.ts'
import { pathFeature } from './path.ts'
import { processFeature } from './process.ts'
import { timersFeature } from './timers.ts'
import { urlFeature } from './url.ts'

export const runtimeBackedFeatures: CompilerFeatureDescriptor[] = [
  binaryFeature,
  childProcessFeature,
  clocksFeature,
  cryptoFeature,
  debugMemoryFeature,
  fsFeature,
  jsonFeature,
  osFeature,
  pathFeature,
  processFeature,
  timersFeature,
  urlFeature
]
