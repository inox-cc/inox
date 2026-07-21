type array = unknown

import type { CompilerShapeAnyNode } from './compiler-shape-anynode-import.d.ts'

export type CompilerShapeObjectMetadata = {
  [key: string]: any
  fields: array<CompilerShapeAnyNode>
}

export type CompilerShapeCompatibilityMetadata = {
  shape: CompilerShapeObjectMetadata | null
}
