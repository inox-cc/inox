#ifndef INOX_FS_H
#define INOX_FS_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

enum {
  INOX_FS_F_OK = 0,
  INOX_FS_X_OK = 1,
  INOX_FS_W_OK = 2,
  INOX_FS_R_OK = 4
};

typedef inox::String (*FsReadFileFn)(void* user, inox::StringView path);
typedef inox_status (*FsReadFileBytesFn)(
  void* user,
  inox_allocator* allocator,
  inox::StringView path,
  inox_value* out
);
typedef inox_status (*FsReadDirFn)(
  void* user,
  inox_allocator* allocator,
  inox::StringView path,
  inox_value* out
);
typedef inox_status (*FsReadDirDirentsFn)(
  void* user,
  inox_allocator* allocator,
  inox::StringView path,
  inox_value* out
);
typedef inox_status (*FsStatFn)(
  void* user,
  inox_allocator* allocator,
  inox::StringView path,
  inox_value* out
);
typedef inox::String (*FsStringPathFn)(
  void* user,
  inox::StringView path
);
typedef void (*FsAccessFn)(void* user, inox::StringView path, int mode);
typedef void (*FsMkdirFn)(void* user, inox::StringView path, bool recursive);
typedef void (*FsUnlinkFn)(void* user, inox::StringView path);
typedef void (*FsRmFn)(void* user, inox::StringView path, bool recursive, bool force);
typedef void (*FsAppendFileFn)(void* user, inox::StringView path, inox::StringView bytes);
typedef void (*FsCopyFileFn)(void* user, inox::StringView src_path, inox::StringView dest_path);
typedef void (*FsSymlinkFn)(void* user, inox::StringView target, inox::StringView path);
typedef void (*FsRenameFn)(void* user, inox::StringView old_path, inox::StringView new_path);
typedef void (*FsWriteFileFn)(void* user, inox::StringView path, inox::StringView bytes);

struct FsAdapter {
  void* user;
  FsReadFileFn read_file;
  FsWriteFileFn write_file;
  FsReadDirFn read_dir;
  FsReadDirDirentsFn read_dir_dirents;
  FsReadFileBytesFn read_file_bytes;
  FsStatFn stat;
  FsStatFn lstat;
  FsStringPathFn realpath;
  FsStringPathFn readlink;
  FsAccessFn access;
  FsMkdirFn mkdir;
  FsUnlinkFn unlink;
  FsRmFn rm;
  FsAppendFileFn append_file;
  FsCopyFileFn copy_file;
  FsSymlinkFn symlink;
  FsRenameFn rename;
};
#ifdef __cplusplus

#include "inox/array.h"
#include "inox/binary.h"

class FsStats;
class fs_promises {
public:
  inox::Promise readFile(inox::StringView path);
  inox::Promise readFileBytes(inox::StringView path);
  inox::Promise readdir(inox::StringView path);
  inox::Promise readdirDirents(inox::StringView path);
  inox::Promise stat(inox::StringView path);
  inox::Promise lstat(inox::StringView path);
  inox::Promise realpath(inox::StringView path);
  inox::Promise readlink(inox::StringView path);
  inox::Promise access(inox::StringView path, int mode);
  inox::Promise mkdir(inox::StringView path, bool recursive);
  inox::Promise rm(inox::StringView path, bool recursive, bool force);
  inox::Promise writeFile(inox::StringView path, inox::StringView bytes);
  inox::Promise writeFile(inox::StringView path, inox_value bytes);
  inox::Promise appendFile(inox::StringView path, inox::StringView bytes);
  inox::Promise appendFile(inox::StringView path, inox_value bytes);
  inox::Promise copyFile(inox::StringView src_path, inox::StringView dest_path);
  inox::Promise symlink(inox::StringView target, inox::StringView path);
  inox::Promise rename(inox::StringView old_path, inox::StringView new_path);
  inox::Promise unlink(inox::StringView path);
};

class fs {
public:
  fs_promises promises;

  void setAdapter(FsAdapter adapter);
  FsAdapter getAdapter();
  void clearAdapter();

  inox::String readFileSync(inox::StringView path);
  Buffer readFileBytesSync(inox::StringView path);
  ArrayClass readdirSync(inox::StringView path);
  ArrayClass readdirDirentsSync(inox::StringView path);
  FsStats statSync(inox::StringView path);
  FsStats lstatSync(inox::StringView path);
  inox::String realpathSync(inox::StringView path);
  inox::String readlinkSync(inox::StringView path);
  void accessSync(inox::StringView path, int mode);
  void mkdirSync(inox::StringView path, bool recursive);
  void unlinkSync(inox::StringView path);
  void rmSync(inox::StringView path, bool recursive, bool force);
  void appendFileSync(inox::StringView path, inox::StringView bytes);
  void appendFileSync(inox::StringView path, inox_value bytes);
  void copyFileSync(inox::StringView src_path, inox::StringView dest_path);
  void symlinkSync(inox::StringView target, inox::StringView path);
  void renameSync(inox::StringView old_path, inox::StringView new_path);
  void writeFileSync(inox::StringView path, inox::StringView bytes);
  void writeFileSync(inox::StringView path, inox_value bytes);
};

class FsStats : public inox::Value {
public:
  FsStats();
  explicit FsStats(inox_value value);
  explicit FsStats(const inox::Value& value);
  explicit FsStats(inox::Value&& value);
  FsStats(inox::AdoptValue, inox_value value);

  bool isFile() const;
  bool isDirectory() const;
};

class FsDirent : public inox::Value {
public:
  FsDirent();
  explicit FsDirent(inox_value value);
  explicit FsDirent(const inox::Value& value);
  explicit FsDirent(inox::Value&& value);

  bool isFile() const;
  bool isDirectory() const;
};

extern fs fs;

#endif

#endif
