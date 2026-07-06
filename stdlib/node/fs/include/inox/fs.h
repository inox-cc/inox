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

typedef inox_status (*inox_fs_read_file_fn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*inox_fs_read_file_bytes_fn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*inox_fs_read_dir_fn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*inox_fs_read_dir_dirents_fn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*inox_fs_stat_fn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*inox_fs_string_path_fn)(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
);
typedef inox_status (*inox_fs_access_fn)(void* user, const char* path, size_t path_len, int mode);
typedef inox_status (*inox_fs_mkdir_fn)(void* user, const char* path, size_t path_len, bool recursive);
typedef inox_status (*inox_fs_unlink_fn)(void* user, const char* path, size_t path_len);
typedef inox_status (*inox_fs_rm_fn)(void* user, const char* path, size_t path_len, bool recursive, bool force);
typedef inox_status (*inox_fs_append_file_fn)(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
typedef inox_status (*inox_fs_copy_file_fn)(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
typedef inox_status (*inox_fs_symlink_fn)(
  void* user,
  const char* target,
  size_t target_len,
  const char* path,
  size_t path_len
);
typedef inox_status (*inox_fs_rename_fn)(
  void* user,
  const char* old_path,
  size_t old_path_len,
  const char* new_path,
  size_t new_path_len
);
typedef inox_status (*inox_fs_write_file_fn)(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);

typedef struct inox_fs_adapter {
  void* user;
  inox_fs_read_file_fn read_file;
  inox_fs_write_file_fn write_file;
  inox_fs_read_dir_fn read_dir;
  inox_fs_read_dir_dirents_fn read_dir_dirents;
  inox_fs_read_file_bytes_fn read_file_bytes;
  inox_fs_stat_fn stat;
  inox_fs_stat_fn lstat;
  inox_fs_string_path_fn realpath;
  inox_fs_string_path_fn readlink;
  inox_fs_access_fn access;
  inox_fs_mkdir_fn mkdir;
  inox_fs_unlink_fn unlink;
  inox_fs_rm_fn rm;
  inox_fs_append_file_fn append_file;
  inox_fs_copy_file_fn copy_file;
  inox_fs_symlink_fn symlink;
  inox_fs_rename_fn rename;
} inox_fs_adapter;

void inox_fs_set_adapter(inox_fs_adapter adapter);
inox_fs_adapter inox_fs_get_adapter(void);
void inox_fs_clear_adapter(void);
#ifdef __cplusplus

class fs_promises {
public:
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

  inox_status readFileSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status readFileBytesSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status readdirSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status readdirDirentsSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status statSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status lstatSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status realpathSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
  inox_status readlinkSync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
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
