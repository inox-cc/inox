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

type NodeList = AnyNode[]

type IrProgramWithFunctionDeclarations = {
  functionDeclarations: IrFunctionDeclaration[]
}

type IrTopLevelProgram = {
  body: NodeList
  topLevelItems: IrTopLevelItem[]
}

type IrFunctionNodeProgram = IrTopLevelProgram & {
  functionDeclarations: IrFunctionDeclaration[]
}

type IrTopLevelNodeEntry = {
  kind: IrTopLevelItemKind
  node: AnyNode
}

export type IrFunctionNodeEntry = {
  declaration: IrFunctionDeclaration
  node: AnyNode
}

type FunctionDeclarationMap = Map<string, IrFunctionDeclaration[]>

export function collectIrModuleRecords(graph: ModuleGraph): IrModuleRecord[] {
  const records: IrModuleRecord[] = []

  for (const module of graph.modules) {
    if (module.ir != null) {
      records.push({
        path: module.path,
        ir: module.ir
      })
    }
  }

  return records
}

export function collectIrPrograms(records: IrModuleRecord[]): IrProgram[] {
  const programs: IrProgram[] = []

  for (const record of records) {
    programs.push(record.ir)
  }

  return programs
}

export function findIrEntryProgram(records: IrModuleRecord[], entry: string): IrProgram | null {
  for (const record of records) {
    if (record.path === entry) {
      return record.ir
    }
  }

  return null
}

export function collectIrFunctionDeclarations(
  programs: IrProgramWithFunctionDeclarations[]
): IrFunctionDeclaration[] {
  const declarations: IrFunctionDeclaration[] = []

  for (const program of programs) {
    for (const declaration of program.functionDeclarations) {
      declarations.push(declaration)
    }
  }

  return declarations
}

export function collectIrFunctionNodeEntries(programs: IrFunctionNodeProgram[]): IrFunctionNodeEntry[] {
  const entries: IrFunctionNodeEntry[] = []

  for (const program of programs) {
    const declarationsByName = collectFunctionDeclarationsByName(program.functionDeclarations)
    const topLevelEntries = collectIrTopLevelNodeEntries(program)

    for (const item of topLevelEntries) {
      if (item.kind === 'function') {
        const name = nodeNameForTopLevelLookup(item.node)
        const declarations = declarationsByName.get(name)
        const declaration = shiftFunctionDeclaration(declarations)

        if (declaration != null) {
          entries.push({
            declaration,
            node: item.node
          })
        }
      }
    }
  }

  return entries
}

export function hasIrFunctionDeclaration(program: IrProgram | null | undefined, name: string): boolean {
  if (program == null) {
    return false
  }

  for (const item of program.functionDeclarations) {
    if (item.name === name) {
      return true
    }
  }

  return false
}

export function collectIrTopLevelNodeEntries(program: IrTopLevelProgram): IrTopLevelNodeEntry[] {
  const entries: IrTopLevelNodeEntry[] = []

  for (const item of program.topLevelItems) {
    const node = nodeAt(program.body, item.index)

    if (node != null) {
      entries.push({
        kind: item.kind,
        node
      })
    }
  }

  return entries
}

export function collectIrTopLevelNodes(program: IrTopLevelProgram, kind: IrTopLevelItemKind): NodeList {
  const nodes: NodeList = []

  for (const item of collectIrTopLevelNodeEntries(program)) {
    if (item.kind === kind) {
      nodes.push(item.node)
    }
  }

  return nodes
}

export function collectIrTopLevelNodesFromPrograms(
  programs: IrTopLevelProgram[],
  kind: IrTopLevelItemKind
): NodeList {
  const nodes: NodeList = []

  for (const program of programs) {
    for (const node of collectIrTopLevelNodes(program, kind)) {
      nodes.push(node)
    }
  }

  return nodes
}

export function collectTopLevelItems(program: ProgramNode): IrTopLevelItem[] {
  const items: IrTopLevelItem[] = []

  for (let index = 0; index < program.body.length; index = index + 1) {
    const item = program.body[index]

    if (item.type !== 'ExportDeclaration') {
      items.push({
        kind: topLevelItemKind(item),
        index,
        loc: item.loc
      })
    }
  }

  return items
}

export function collectFunctionDeclarations(
  program: ProgramNode,
  topLevelItems: IrTopLevelItem[]
): IrFunctionDeclaration[] {
  const declarations: IrFunctionDeclaration[] = []
  const nodes = collectIrTopLevelNodes(
    {
      body: program.body,
      topLevelItems
    },
    'function'
  )

  for (const item of nodes) {
    const name = item.name

    if (name != null) {
      declarations.push(createFunctionDeclaration(item, name))
    }
  }

  return declarations
}

function collectFunctionDeclarationsByName(declarations: IrFunctionDeclaration[]): FunctionDeclarationMap {
  const declarationsByName = createFunctionDeclarationMap()

  for (const declaration of declarations) {
    const items = functionDeclarationListForName(declarationsByName, declaration.name)
    items.push(declaration)
  }

  return declarationsByName
}

function createFunctionDeclarationMap(): FunctionDeclarationMap {
  const map: FunctionDeclarationMap = new Map()
  return map
}

function functionDeclarationListForName(
  declarationsByName: FunctionDeclarationMap,
  name: string
): IrFunctionDeclaration[] {
  const existing = declarationsByName.get(name)

  if (existing != null) {
    return existing
  }

  const created: IrFunctionDeclaration[] = []
  declarationsByName.set(name, created)
  return created
}

function nodeAt(nodes: NodeList, index: number): AnyNode | null {
  if (index < 0 || index >= nodes.length) {
    return null
  }

  return nodes[index]
}

function shiftFunctionDeclaration(
  declarations: IrFunctionDeclaration[] | null | undefined
): IrFunctionDeclaration | null {
  if (declarations == null) {
    return null
  }

  const declaration = declarations.shift()

  if (declaration == null) {
    return null
  }

  return declaration
}

function nodeNameForTopLevelLookup(node: AnyNode): string {
  if (node.name == null) {
    return ''
  }

  return node.name
}

function createFunctionDeclaration(item: AnyNode, name: string): IrFunctionDeclaration {
  const declaration: IrFunctionDeclaration = {
    name,
    exported: item.exported === true,
    async: item.async === true,
    params: item.params,
    returnType: item.returnType,
    returnNullable: item.returnNullable === true,
    loc: item.loc
  }

  if (item.returnArrayElementType != null) {
    declaration.returnArrayElementType = item.returnArrayElementType
  }

  if (item.returnArrayElementDeclaredType != null) {
    declaration.returnArrayElementDeclaredType = item.returnArrayElementDeclaredType
  }

  if (item.returnMapKeyType != null) {
    declaration.returnMapKeyType = item.returnMapKeyType
  }

  if (item.returnMapValueType != null) {
    declaration.returnMapValueType = item.returnMapValueType
  }

  if (item.returnPromiseValueType != null) {
    declaration.returnPromiseValueType = item.returnPromiseValueType
  }

  if (item.returnSetElementType != null) {
    declaration.returnSetElementType = item.returnSetElementType
  }

  if (item.returnShape != null) {
    declaration.returnShape = item.returnShape
  }

  return declaration
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
