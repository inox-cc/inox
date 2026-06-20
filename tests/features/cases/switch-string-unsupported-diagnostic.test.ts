// @targets c
// @expect diagnostics INOX_C_SWITCH_CASE

const value: string = 'ok'
switch (value) {
  case 'ok':
    console.log('yes')
}
