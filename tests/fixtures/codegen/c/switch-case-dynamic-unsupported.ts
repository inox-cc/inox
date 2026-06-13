// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_SWITCH_CASE

function choose(label: string): number {
  return 1
}

const code = 1

switch (code) {
  case choose('one'):
    console.log('one')
    break
  default:
    console.log('other')
}

