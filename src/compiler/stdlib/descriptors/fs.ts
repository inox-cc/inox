export type FsRuntimeMode = 'callback' | 'extension' | 'promise' | 'sync'

export type FsRuntimeCallInfo = {
  method: string
  nodeName: string
  path: string[]
  root: string
  viaPromises: boolean
  mode: FsRuntimeMode
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

const legacyExtensionMethods = new Set([
  'appendFileBytes',
  'appendFileBytesSync',
  'readDir',
  'readDirSync',
  'readFileBytes',
  'readFileBytesSync',
  'writeFileBytes',
  'writeFileBytesSync'
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

  return legacyExtensionMethods.has(nodeName)
    ? {
        method: nodeName,
        nodeName,
        path,
        root: path[0],
        viaPromises: false,
        mode: 'extension'
      }
    : null
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

export function unsupportedFsRuntimeMethodMessage(info: FsRuntimeCallInfo, promisesApi: boolean): string | null {
  if (
    ['appendFileBytes', 'appendFileBytesSync', 'readFileBytes', 'readFileBytesSync', 'writeFileBytes', 'writeFileBytesSync'].includes(
      info.method
    )
  ) {
    return `function ${info.path.join('.')} is not part of Node fs; use fs.promises.readFile/writeFile or fs.readFileSync/writeFileSync`
  }

  if (info.method === 'readDir') {
    if (info.nodeName === 'readDir') {
      return `function ${info.path.join('.')} is not part of Node fs; use fs.promises.readdir or fs.readdirSync`
    }

    return promisesApi ? null : 'Node fs.readdir callback API is not supported yet; use fs.promises.readdir'
  }

  if (info.method === 'readDirSync' && info.nodeName === 'readDirSync') {
    return `function ${info.path.join('.')} is not part of Node fs; use fs.readdirSync`
  }

  if (info.mode === 'callback' && !promisesApi) {
    return `Node ${info.path.join('.')} callback API is not supported yet; use fs.promises.${info.method}`
  }

  return null
}
