// @targets c
// @expect pass
// @stderr SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)

try {
  JSON.parse('{')
} catch (error) {
  console.error(error)
}
