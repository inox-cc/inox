// @targets c
// @expect diagnostic
// @diagnostic INOX_C_ARRAY_METHOD

function compare(left: number, right: number): number {
  return left - right
}

const values = [3, 1, 2]
values.sort(compare)

