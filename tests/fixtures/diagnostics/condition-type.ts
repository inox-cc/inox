// @expect diagnostic
// @diagnostic INOX_CONDITION_TYPE

function noop(): void {}

export function main(): void {
  if (noop()) {
    console.log('bad')
  }
}
