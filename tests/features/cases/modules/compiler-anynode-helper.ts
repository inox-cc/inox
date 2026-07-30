export type AnyNode = {
  type?: string
  [key: string]: any
}

export type CheckerNode = AnyNode

export function checkerNodeAt(values: CheckerNode[], index: number): CheckerNode | null {
  return values[index]
}
