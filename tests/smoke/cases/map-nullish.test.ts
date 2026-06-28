// @targets cc
// @expect pass
// @stdout [owner, mode, retries]
// @stdout [[owner, Ada], [mode, smoke], [retries, 2]]
// @stdout primary=Ada;fallback=missing;
// @stdout seen:yes/2
// @stdout routes:1

const config = {
  owner: 'Ada',
  mode: 'smoke',
  retries: 2
}

const routes: Map<string, string> = new Map()
routes.set('primary', config.owner)
routes.set('fallback', routes.get('missing') ?? 'missing')

const seen: Set<string> = new Set()
seen.add(routes.get('primary') ?? 'missing')
seen.add(routes.get('fallback') ?? 'missing')
seen.add(routes.get('primary') ?? 'missing')

let routeSummary = ''
for (const entry of routes) {
  routeSummary = routeSummary + entry.key + '=' + entry.value + ';'
}

let hasOwner = 'no'
if (seen.has('Ada')) {
  hasOwner = 'yes'
}

routes.delete('fallback')

console.log(Object.keys(config))
console.log(Object.entries(config))
console.log(routeSummary)
console.log('seen:' + hasOwner + '/' + String(seen.size))
console.log('routes:' + String(routes.size))
