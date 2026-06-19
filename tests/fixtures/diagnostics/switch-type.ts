// @expect diagnostic
// @diagnostic INOX_SWITCH_TYPE

export function main(): void {
  switch (1) {
    case 'one':
      console.log('bad')
  }
}
