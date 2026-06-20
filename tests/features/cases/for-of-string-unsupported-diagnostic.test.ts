// @targets c
// @expect diagnostics INOX_C_FOR_OF

for (const char of 'Ada') {
  console.log(char)
}
