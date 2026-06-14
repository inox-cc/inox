export type FsRuntimeMode = 'callback' | 'promise' | 'sync'

export type FsRuntimeCallInfo = {
  method: string
  nodeName: string
  path: string[]
  root: string
  viaPromises: boolean
  mode: FsRuntimeMode
}

export type RemovedFsRuntimeMethodInfo = {
  path: string[]
  root: string
  message: string
}

const promiseNodeMethods = new Map<string, string>([
  ['access', 'access'],
  ['appendFile', 'appendFile'],
  ['copyFile', 'copyFile'],
  ['lstat', 'lstat'],
  ['mkdir', 'mkdir'],
  ['readFile', 'readFile'],
  ['readdir', 'readDir'],
  ['readlink', 'readlink'],
  ['realpath', 'realpath'],
  ['rename', 'rename'],
  ['rm', 'rm'],
  ['stat', 'stat'],
  ['symlink', 'symlink'],
  ['unlink', 'unlink'],
  ['writeFile', 'writeFile']
])

const syncNodeMethods = new Map<string, string>([
  ['accessSync', 'accessSync'],
  ['appendFileSync', 'appendFileSync'],
  ['copyFileSync', 'copyFileSync'],
  ['lstatSync', 'lstatSync'],
  ['mkdirSync', 'mkdirSync'],
  ['readFileSync', 'readFileSync'],
  ['readdirSync', 'readDirSync'],
  ['readlinkSync', 'readlinkSync'],
  ['realpathSync', 'realpathSync'],
  ['renameSync', 'renameSync'],
  ['rmSync', 'rmSync'],
  ['statSync', 'statSync'],
  ['symlinkSync', 'symlinkSync'],
  ['unlinkSync', 'unlinkSync'],
  ['writeFileSync', 'writeFileSync']
])

const callbackNodeMethods = new Map<string, string>([
  ['access', 'access'],
  ['appendFile', 'appendFile'],
  ['copyFile', 'copyFile'],
  ['lstat', 'lstat'],
  ['mkdir', 'mkdir'],
  ['readFile', 'readFile'],
  ['readdir', 'readDir'],
  ['readlink', 'readlink'],
  ['realpath', 'realpath'],
  ['rename', 'rename'],
  ['rm', 'rm'],
  ['stat', 'stat'],
  ['symlink', 'symlink'],
  ['unlink', 'unlink'],
  ['writeFile', 'writeFile']
])

const removedExtensionMethodMessages = new Map<string, string>([
  ['appendFileBytes', 'use fs.promises.appendFile or fs.appendFileSync'],
  ['appendFileBytesSync', 'use fs.appendFileSync'],
  ['readDir', 'use fs.promises.readdir or fs.readdirSync'],
  ['readDirSync', 'use fs.readdirSync'],
  ['readFileBytes', 'use fs.promises.readFile or fs.readFileSync'],
  ['readFileBytesSync', 'use fs.readFileSync'],
  ['writeFileBytes', 'use fs.promises.writeFile or fs.writeFileSync'],
  ['writeFileBytesSync', 'use fs.writeFileSync']
])

const promiseRuntimeMethodNodePaths = new Map<string, string[]>([
  ['access', ['fs', 'promises', 'access']],
  ['appendFile', ['fs', 'promises', 'appendFile']],
  ['appendFileBytes', ['fs', 'promises', 'appendFile']],
  ['copyFile', ['fs', 'promises', 'copyFile']],
  ['lstat', ['fs', 'promises', 'lstat']],
  ['mkdir', ['fs', 'promises', 'mkdir']],
  ['readFile', ['fs', 'promises', 'readFile']],
  ['readFileBytes', ['fs', 'promises', 'readFile']],
  ['readDir', ['fs', 'promises', 'readdir']],
  ['readDirDirents', ['fs', 'promises', 'readdir']],
  ['readlink', ['fs', 'promises', 'readlink']],
  ['realpath', ['fs', 'promises', 'realpath']],
  ['rename', ['fs', 'promises', 'rename']],
  ['rm', ['fs', 'promises', 'rm']],
  ['stat', ['fs', 'promises', 'stat']],
  ['symlink', ['fs', 'promises', 'symlink']],
  ['unlink', ['fs', 'promises', 'unlink']],
  ['writeFile', ['fs', 'promises', 'writeFile']],
  ['writeFileBytes', ['fs', 'promises', 'writeFile']]
])

const syncRuntimeMethodNodePaths = new Map<string, string[]>([
  ['accessSync', ['fs', 'accessSync']],
  ['appendFileSync', ['fs', 'appendFileSync']],
  ['appendFileBytesSync', ['fs', 'appendFileSync']],
  ['copyFileSync', ['fs', 'copyFileSync']],
  ['lstatSync', ['fs', 'lstatSync']],
  ['mkdirSync', ['fs', 'mkdirSync']],
  ['readFileSync', ['fs', 'readFileSync']],
  ['readFileBytesSync', ['fs', 'readFileSync']],
  ['readDirSync', ['fs', 'readdirSync']],
  ['readDirDirentsSync', ['fs', 'readdirSync']],
  ['readlinkSync', ['fs', 'readlinkSync']],
  ['realpathSync', ['fs', 'realpathSync']],
  ['renameSync', ['fs', 'renameSync']],
  ['rmSync', ['fs', 'rmSync']],
  ['statSync', ['fs', 'statSync']],
  ['symlinkSync', ['fs', 'symlinkSync']],
  ['unlinkSync', ['fs', 'unlinkSync']],
  ['writeFileSync', ['fs', 'writeFileSync']],
  ['writeFileBytesSync', ['fs', 'writeFileSync']]
])

const fsPromiseUsagePaths = new Set([...promiseNodeMethods.keys()].map((method) => `fs.promises.${method}`))
const fsSyncUsagePaths = new Set([...syncNodeMethods.keys()].map((method) => `fs.${method}`))

export function fsRuntimeCallInfoFromPath(path: string[] | null | undefined): FsRuntimeCallInfo | null {
  if (path == null || path.length < 2) {
    return null
  }

  const nodeName = path[path.length - 1]

  if (path.length === 3 && path[1] === 'promises') {
    const method = promiseNodeMethods.get(nodeName)

    return method == null
      ? null
      : {
          method,
          nodeName,
          path,
          root: path[0],
          viaPromises: true,
          mode: 'promise'
        }
  }

  if (path.length !== 2) {
    return null
  }

  const syncMethod = syncNodeMethods.get(nodeName)

  if (syncMethod != null) {
    return {
      method: syncMethod,
      nodeName,
      path,
      root: path[0],
      viaPromises: false,
      mode: 'sync'
    }
  }

  const callbackMethod = callbackNodeMethods.get(nodeName)

  if (callbackMethod != null) {
    return {
      method: callbackMethod,
      nodeName,
      path,
      root: path[0],
      viaPromises: false,
      mode: 'callback'
    }
  }

  return null
}

export function fsRuntimeMethodForPath(path: string[] | null | undefined): string | null {
  return fsRuntimeCallInfoFromPath(path)?.method ?? null
}

export function fsGlobalUsagePathForRuntimeMethod(method: string): string[] | null {
  return promiseRuntimeMethodNodePaths.get(method) ?? syncRuntimeMethodNodePaths.get(method) ?? null
}

export function isFsPromiseUsagePath(path: string): boolean {
  return fsPromiseUsagePaths.has(path)
}

export function isFsSyncUsagePath(path: string): boolean {
  return fsSyncUsagePaths.has(path) || path.startsWith('fs.constants.')
}

export function isFsPromiseRuntimeMethod(method: string): boolean {
  return promiseRuntimeMethodNodePaths.has(method)
}

export function isFsSyncRuntimeMethod(method: string): boolean {
  return syncRuntimeMethodNodePaths.has(method)
}

export function isAsyncFsRuntimeMethod(method: string): boolean {
  return isFsPromiseRuntimeMethod(method)
}

export function removedFsRuntimeMethodInfoFromPath(
  path: string[] | null | undefined
): RemovedFsRuntimeMethodInfo | null {
  if (path == null || path.length !== 2) {
    return null
  }

  const nodeName = path[1]
  const replacement = removedExtensionMethodMessages.get(nodeName)

  return replacement == null
    ? null
    : {
        path,
        root: path[0],
        message: `function ${path.join('.')} is not part of Node fs; ${replacement}`
      }
}

export function unsupportedFsRuntimeMethodMessage(info: FsRuntimeCallInfo, promisesApi: boolean): string | null {
  if (info.method === 'readDir') {
    return promisesApi ? null : 'Node fs.readdir callback API is not supported yet; use fs.promises.readdir'
  }

  if (info.mode === 'callback' && !promisesApi) {
    return `Node ${info.path.join('.')} callback API is not supported yet; use fs.promises.${info.method}`
  }

  return null
}
