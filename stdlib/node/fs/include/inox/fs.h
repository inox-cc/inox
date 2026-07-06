#ifndef INOX_FS_H
#define INOX_FS_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/value.h"

enum {
  INOX_FS_F_OK = 0,
  INOX_FS_X_OK = 1,
  INOX_FS_W_OK = 2,
  INOX_FS_R_OK = 4
};

typedef inox_status (*FsReadFileFn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*FsReadFileBytesFn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*FsReadDirFn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*FsReadDirDirentsFn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*FsStatFn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*FsStringPathFn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*FsAccessFn)(void* user, const char* path, size_t path_len, int mode);
typedef inox_status (*FsMkdirFn)(void* user, const char* path, size_t path_len, bool recursive);
typedef inox_status (*FsUnlinkFn)(void* user, const char* path, size_t path_len);
typedef inox_status (*FsRmFn)(void* user, const char* path, size_t path_len, bool recursive, bool force);
typedef inox_status (*FsAppendFileFn)(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
typedef inox_status (*FsCopyFileFn)(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
typedef inox_status (*FsSymlinkFn)(
  void* user,
  const char* target,
  size_t target_len,
  const char* path,
  size_t path_len
);
typedef inox_status (*FsRenameFn)(
  void* user,
  const char* old_path,
  size_t old_path_len,
  const char* new_path,
  size_t new_path_len
);
typedef inox_status (*FsWriteFileFn)(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);

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
#include "inox/string.h"
#include "inox/string_view.h"

class FsStats;
class fs_promises {
public:
  inox::Promise readFile(inox::StringView path);
  inox::Promise writeFile(inox::StringView path, inox::StringView bytes);
  inox::Promise appendFile(inox::StringView path, inox::StringView bytes);
  inox::Promise unlink(inox::StringView path);

  inox_status readFile(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status readFileBytes(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status readdir(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status readdirDirents(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status stat(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status lstat(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status realpath(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status readlink(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status access(inox_loop* loop, const char* path, size_t path_len, int mode, inox_promise** out);
  inox_status mkdir(inox_loop* loop, const char* path, size_t path_len, bool recursive, inox_promise** out);
  inox_status unlink(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
  inox_status rm(inox_loop* loop, const char* path, size_t path_len, bool recursive, bool force, inox_promise** out);
  inox_status appendFile(inox_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, inox_promise** out);
  inox_status appendFileBytes(inox_loop* loop, const char* path, size_t path_len, inox_value bytes, inox_promise** out);
  inox_status copyFile(
    inox_loop* loop,
    const char* src_path,
    size_t src_path_len,
    const char* dest_path,
    size_t dest_path_len,
    inox_promise** out
  );
  inox_status symlink(inox_loop* loop, const char* target, size_t target_len, const char* path, size_t path_len, inox_promise** out);
  inox_status rename(
    inox_loop* loop,
    const char* old_path,
    size_t old_path_len,
    const char* new_path,
    size_t new_path_len,
    inox_promise** out
  );
  inox_status writeFile(inox_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, inox_promise** out);
  inox_status writeFileBytes(inox_loop* loop, const char* path, size_t path_len, inox_value bytes, inox_promise** out);
};

class fs {
public:
  fs_promises promises;

  void setAdapter(FsAdapter adapter);
  FsAdapter getAdapter();
  void clearAdapter();

  inox::String readFileSync(inox::StringView path);
  ArrayClass readdirSync(inox::StringView path);
  ArrayClass readdirDirentsSync(inox::StringView path);
  FsStats statSync(inox::StringView path);
  FsStats lstatSync(inox::StringView path);
  inox::String realpathSync(inox::StringView path);
  inox::String readlinkSync(inox::StringView path);
  void mkdirSync(inox::StringView path, bool recursive);
  void unlinkSync(inox::StringView path);
  void rmSync(inox::StringView path, bool recursive, bool force);
  void appendFileSync(inox::StringView path, inox::StringView bytes);
  void writeFileSync(inox::StringView path, inox::StringView bytes);
  inox_status readFileBytesSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status accessSync(const char* path, size_t path_len, int mode);
  inox_status mkdirSync(const char* path, size_t path_len, bool recursive);
  inox_status unlinkSync(const char* path, size_t path_len);
  inox_status rmSync(const char* path, size_t path_len, bool recursive, bool force);
  inox_status appendFileSync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
  inox_status appendFileBytesSync(const char* path, size_t path_len, inox_value bytes);
  inox_status copyFileSync(const char* src_path, size_t src_path_len, const char* dest_path, size_t dest_path_len);
  inox_status symlinkSync(const char* target, size_t target_len, const char* path, size_t path_len);
  inox_status renameSync(const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
  inox_status writeFileSync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
  inox_status writeFileBytesSync(const char* path, size_t path_len, inox_value bytes);
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
