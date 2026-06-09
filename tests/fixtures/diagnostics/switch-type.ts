// @expect diagnostic
// @diagnostic CCJS_SWITCH_TYPE

export function main(): void {
  switch (1) {
    case 'one':
      console.log('bad')
  }
}
