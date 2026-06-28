import type { CompilerFeatureDescriptor } from '../types.ts'
import { debugMemoryFeature } from './debug-memory.ts'

export const runtimeBackedFeatures: CompilerFeatureDescriptor[] = [
  debugMemoryFeature
]
