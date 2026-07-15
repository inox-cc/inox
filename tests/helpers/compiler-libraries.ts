import {
  createCompilerLibraryLiteralTypeInferenceFromDiscovered,
  createCompilerLibrarySetFromDiscovered
} from '../../scripts/lib/compiler-library-registry.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const discoveredCompilerLibraries = await discoverCompilerLibraries()

export const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(discoveredCompilerLibraries)
export const defaultCompilerLibraryLiteralTypeInference =
  createCompilerLibraryLiteralTypeInferenceFromDiscovered(discoveredCompilerLibraries)
