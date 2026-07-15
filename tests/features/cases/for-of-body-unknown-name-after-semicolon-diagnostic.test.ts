// @targets cc
// @expect diagnostics INOX_UNKNOWN_NAME

for (const item of [1]) {
  console.log(item)
  missingName
}
