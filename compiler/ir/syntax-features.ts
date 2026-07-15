import type { AnyNode, IrSyntaxFeatureUsage, ProgramNode } from '../types.ts'

type SyntaxFeatureRawNode = AnyNode
type SyntaxFeatureNode = AnyNode & {
  type?: string
}
type SyntaxFeatureChildNode = SyntaxFeatureNode
type SyntaxFeatureProgram = {
  syntaxFeatures: IrSyntaxFeatureUsage[]
}

export function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
}

export function collectIrSyntaxFeatureUsages(programs: SyntaxFeatureProgram[]): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = syntaxFeatureProgramAt(programs, programIndex)

    for (let usageIndex = 0; usageIndex < program.syntaxFeatures.length; usageIndex = usageIndex + 1) {
      const usage = syntaxFeatureUsageAt(program.syntaxFeatures, usageIndex)

      usages.push(usage)
    }
  }

  return usages
}

function syntaxFeatureProgramAt(programs: SyntaxFeatureProgram[], index: number): SyntaxFeatureProgram {
  return programs[index]
}

function syntaxFeatureUsageAt(usages: IrSyntaxFeatureUsage[], index: number): IrSyntaxFeatureUsage {
  return usages[index]
}

function syntaxFeatureArrayNodeAt(nodes: SyntaxFeatureRawNode[], index: number): SyntaxFeatureRawNode {
  return nodes[index]
}

function visitSyntaxFeatureUsage(
  node: SyntaxFeatureRawNode | SyntaxFeatureRawNode[] | null | undefined,
  usages: IrSyntaxFeatureUsage[]
): void {
  if (node !== null && typeof node !== 'undefined') {
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index = index + 1) {
        const item = syntaxFeatureArrayNodeAt(node, index)

        visitSyntaxFeatureUsage(item, usages)
      }
      return
    }

    const item: SyntaxFeatureNode = node

    if (item.type === 'ClassDeclaration') {
      usages.push({
        feature: 'class',
        loc: item.loc
      })
    } else if (item.type === 'FunctionDeclaration' && item.async === true) {
      usages.push({
        feature: 'async-function',
        loc: item.loc
      })
    }

    visitSyntaxFeatureChildren(item, usages)
  }
}

function visitSyntaxFeatureChild(value: unknown, usages: IrSyntaxFeatureUsage[]): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitSyntaxFeatureUsage(value as AnyNode, usages)
}

function visitSyntaxFeatureChildren(item: SyntaxFeatureChildNode, usages: IrSyntaxFeatureUsage[]): void {
  visitSyntaxFeatureChild(item.body, usages)
  visitSyntaxFeatureChild(item.params, usages)
  visitSyntaxFeatureChild(item.fields, usages)
  visitSyntaxFeatureChild(item.methods, usages)
  visitSyntaxFeatureChild(item.init, usages)
  visitSyntaxFeatureChild(item.condition, usages)
  visitSyntaxFeatureChild(item.consequent, usages)
  visitSyntaxFeatureChild(item.alternate, usages)
  visitSyntaxFeatureChild(item.test, usages)
  visitSyntaxFeatureChild(item.update, usages)
  visitSyntaxFeatureChild(item.iterable, usages)
  visitSyntaxFeatureChild(item.discriminant, usages)
  visitSyntaxFeatureChild(item.cases, usages)
  visitSyntaxFeatureChild(item.block, usages)
  visitSyntaxFeatureChild(item.handler, usages)
  visitSyntaxFeatureChild(item.finalizer, usages)
  visitSyntaxFeatureChild(item.argument, usages)
  visitSyntaxFeatureChild(item.args, usages)
  visitSyntaxFeatureChild(item.callee, usages)
  visitSyntaxFeatureChild(item.object, usages)
  visitSyntaxFeatureChild(item.index, usages)
  visitSyntaxFeatureChild(item.target, usages)
  visitSyntaxFeatureChild(item.value, usages)
  visitSyntaxFeatureChild(item.valueType, usages)
  visitSyntaxFeatureChild(item.functionType, usages)
  visitSyntaxFeatureChild(item.returnShape, usages)
  visitSyntaxFeatureChild(item.left, usages)
  visitSyntaxFeatureChild(item.right, usages)
  visitSyntaxFeatureChild(item.elements, usages)
  visitSyntaxFeatureChild(item.properties, usages)
  visitSyntaxFeatureChild(item.expression, usages)
  visitSyntaxFeatureChild(item.expressions, usages)
}
