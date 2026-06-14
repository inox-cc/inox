import type {
  AnyNode,
  IrFunctionDeclaration,
  IrProgram,
  IrTopLevelItem,
  IrTopLevelItemKind,
  ModuleGraph,
  ProgramNode
} from '../types.ts'

export type IrModuleRecord = {
  path: string
  ir: IrProgram
}

type IrTopLevelNodeEntry = {
  kind: IrTopLevelItemKind
  node: AnyNode
}

export type IrFunctionNodeEntry = {
  declaration: IrFunctionDeclaration
  node: AnyNode
}

export function collectIrModuleRecords(graph: ModuleGraph): IrModuleRecord[] {
  return graph.modules.flatMap((module) =>
    module.ir == null
      ? []
      : [
          {
            path: module.path,
            ir: module.ir
          }
        ]
  )
}

export function collectIrPrograms(records: IrModuleRecord[]): IrProgram[] {
  return records.map((record) => record.ir)
}

export function findIrEntryProgram(records: IrModuleRecord[], entry: string): IrProgram | null {
  return records.find((record) => record.path === entry)?.ir ?? null
}

export function collectIrFunctionDeclarations(
  programs: Array<{ functionDeclarations: IrFunctionDeclaration[] }>
): IrFunctionDeclaration[] {
  return programs.flatMap((program) => program.functionDeclarations)
}

export function collectIrFunctionNodeEntries(
  programs: Array<{
    body: AnyNode[]
    functionDeclarations: IrFunctionDeclaration[]
    topLevelItems: IrTopLevelItem[]
  }>
): IrFunctionNodeEntry[] {
  return programs.flatMap((program) => {
    const declarationsByName = new Map<string, IrFunctionDeclaration[]>()

    for (const declaration of program.functionDeclarations) {
      declarationsByName.set(declaration.name, [...(declarationsByName.get(declaration.name) ?? []), declaration])
    }

    return collectIrTopLevelNodeEntries(program)
      .filter((item) => item.kind === 'function')
      .flatMap((item) => {
        const name = typeof item.node.name === 'string' ? item.node.name : ''
        const declarations = declarationsByName.get(name)
        const declaration = declarations?.shift()

        return declaration == null
          ? []
          : [
              {
                declaration,
                node: item.node
              }
            ]
      })
  })
}

export function hasIrFunctionDeclaration(program: IrProgram | null | undefined, name: string): boolean {
  return program?.functionDeclarations.some((item) => item.name === name) === true
}

export function collectIrTopLevelNodeEntries(program: {
  body: AnyNode[]
  topLevelItems: IrTopLevelItem[]
}): IrTopLevelNodeEntry[] {
  return program.topLevelItems.flatMap((item) => {
    const node = program.body[item.index]

    return node == null
      ? []
      : [
          {
            kind: item.kind,
            node
          }
        ]
  })
}

export function collectIrTopLevelNodes(
  program: { body: AnyNode[]; topLevelItems: IrTopLevelItem[] },
  kind: IrTopLevelItemKind
): AnyNode[] {
  return collectIrTopLevelNodeEntries(program)
    .filter((item) => item.kind === kind)
    .map((item) => item.node)
}

export function collectIrTopLevelNodesFromPrograms(
  programs: Array<{ body: AnyNode[]; topLevelItems: IrTopLevelItem[] }>,
  kind: IrTopLevelItemKind
): AnyNode[] {
  return programs.flatMap((program) => collectIrTopLevelNodes(program, kind))
}

export function collectTopLevelItems(program: ProgramNode): IrTopLevelItem[] {
  return program.body.map((item, index) => ({
    kind: topLevelItemKind(item),
    index,
    loc: item.loc
  }))
}

export function collectFunctionDeclarations(
  program: ProgramNode,
  topLevelItems: IrTopLevelItem[]
): IrFunctionDeclaration[] {
  return collectIrTopLevelNodes(
    {
      body: program.body,
      topLevelItems
    },
    'function'
  )
    .filter((item): item is AnyNode & { name: string } => typeof item.name === 'string')
    .map((item) => ({
      name: item.name,
      exported: item.exported === true,
      async: item.async === true,
      params: item.params,
      returnType: item.returnType,
      returnNullable: item.returnNullable === true,
      ...(item.returnArrayElementType == null ? {} : { returnArrayElementType: item.returnArrayElementType }),
      ...(item.returnArrayElementDeclaredType == null
        ? {}
        : { returnArrayElementDeclaredType: item.returnArrayElementDeclaredType }),
      ...(item.returnMapKeyType == null ? {} : { returnMapKeyType: item.returnMapKeyType }),
      ...(item.returnMapValueType == null ? {} : { returnMapValueType: item.returnMapValueType }),
      ...(item.returnPromiseValueType == null ? {} : { returnPromiseValueType: item.returnPromiseValueType }),
      ...(item.returnSetElementType == null ? {} : { returnSetElementType: item.returnSetElementType }),
      ...(item.returnShape == null ? {} : { returnShape: item.returnShape }),
      loc: item.loc
    }))
}

function topLevelItemKind(item: AnyNode): IrTopLevelItemKind {
  if (item.type === 'ImportDeclaration') {
    return 'import'
  }

  if (item.type === 'FunctionDeclaration') {
    return 'function'
  }

  if (item.type === 'ClassDeclaration') {
    return 'class'
  }

  if (item.type === 'TypeAliasDeclaration') {
    return 'type'
  }

  return 'statement'
}
