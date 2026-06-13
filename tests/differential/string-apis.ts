const raw = '  Ada Lovelace  '
const text = raw.trim()
const first = text.slice(0, 3)
const rest = text.slice(4)
const parts = text.split(' ')
const label = first + '-' + rest
const ok =
  text.includes('Love') &&
  text.startsWith('Ada') &&
  text.endsWith('lace') &&
  label === 'Ada-Lovelace' &&
  parts[1] === 'Lovelace'
const length = String(text.length)

if (ok) {
  console.log(label, length, parts[0])
} else {
  console.log('bad')
}
