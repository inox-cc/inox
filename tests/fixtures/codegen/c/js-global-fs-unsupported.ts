// @targets c
// @expect pass

const text = fs.readFile('/tmp/value.txt', 'utf8')
fs.writeFile('/tmp/out.txt', 'saved')

