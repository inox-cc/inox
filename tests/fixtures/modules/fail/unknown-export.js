// @targets c
// @expect diagnostic
// @diagnostic CCJS_UNKNOWN_EXPORT

import { missing } from './util.js'

export function main(): void {
  missing()
}
