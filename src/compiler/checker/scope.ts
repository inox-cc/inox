import type { SymbolInfo } from '../types.ts'

export class Scope {
  parent: Scope | null
  bindings: Map<string, SymbolInfo>

  constructor(parent: Scope | null) {
    this.parent = parent
    this.bindings = new Map()
  }

  hasOwn(name: string): boolean {
    return this.bindings.has(name)
  }

  resolve(name: string): SymbolInfo | null {
    return this.bindings.get(name) ?? this.parent?.resolve(name) ?? null
  }
}
