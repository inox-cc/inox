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
    const local = this.bindings.get(name)

    if (local !== null && typeof local !== 'undefined') {
      return local
    }

    let current = this.parent

    while (current !== null && typeof current !== 'undefined') {
      const found = current.bindings.get(name)

      if (found !== null && typeof found !== 'undefined') {
        return found
      }

      current = current.parent
    }

    return null
  }
}
