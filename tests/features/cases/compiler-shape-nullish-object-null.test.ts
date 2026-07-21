// @targets cc
// @expect pass
// @stdout missing

class Entry {}

const entries: Entry[] = []
const entry = entries[0] ?? null

console.log(entry === null ? 'missing' : 'present')
