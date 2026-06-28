// @targets cc
// @expect pass
// @stdout 0:0:0

type CompileCaches = {
  diagnostics: string[]
  modules: Map<string, string>
  seen: Set<string>
}

function createCaches(): CompileCaches {
  return {
    diagnostics: [],
    modules: new Map(),
    seen: new Set()
  }
}

const caches = createCaches()
console.log(`${caches.diagnostics.length}:${caches.modules.size}:${caches.seen.size}`)
