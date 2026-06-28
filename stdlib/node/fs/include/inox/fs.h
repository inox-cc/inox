#ifndef INOX_FS_H
#define INOX_FS_H

#ifdef __cplusplus
extern "C" {
#endif

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
inox_status inox_fs_read_file_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_read_file_bytes_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_read_dir_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_read_dir_dirents_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_stat_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_lstat_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_realpath_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_readlink_sync(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
inox_status inox_fs_access_sync(const char* path, size_t path_len, int mode);
inox_status inox_fs_mkdir_sync(const char* path, size_t path_len, bool recursive);
inox_status inox_fs_unlink_sync(const char* path, size_t path_len);
inox_status inox_fs_rm_sync(const char* path, size_t path_len, bool recursive, bool force);
inox_status inox_fs_append_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
inox_status inox_fs_append_file_bytes_sync(const char* path, size_t path_len, inox_value bytes);
inox_status inox_fs_copy_file_sync(const char* src_path, size_t src_path_len, const char* dest_path, size_t dest_path_len);
inox_status inox_fs_symlink_sync(const char* target, size_t target_len, const char* path, size_t path_len);
inox_status inox_fs_rename_sync(const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
inox_status inox_fs_write_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
inox_status inox_fs_write_file_bytes_sync(const char* path, size_t path_len, inox_value bytes);
inox_status inox_fs_read_file(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_read_file_bytes(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_read_dir(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_read_dir_dirents(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_stat(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_lstat(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_realpath(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_readlink(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_access(inox_loop* loop, const char* path, size_t path_len, int mode, inox_promise** out);
inox_status inox_fs_mkdir(inox_loop* loop, const char* path, size_t path_len, bool recursive, inox_promise** out);
inox_status inox_fs_unlink(inox_loop* loop, const char* path, size_t path_len, inox_promise** out);
inox_status inox_fs_rm(inox_loop* loop, const char* path, size_t path_len, bool recursive, bool force, inox_promise** out);
inox_status
inox_fs_append_file(inox_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, inox_promise** out);
inox_status inox_fs_append_file_bytes(inox_loop* loop, const char* path, size_t path_len, inox_value bytes, inox_promise** out);
inox_status inox_fs_copy_file(
  inox_loop* loop,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len,
  inox_promise** out
);
inox_status
inox_fs_symlink(inox_loop* loop, const char* target, size_t target_len, const char* path, size_t path_len, inox_promise** out);
inox_status
inox_fs_rename(inox_loop* loop, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len, inox_promise** out);
inox_status
inox_fs_write_file(inox_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, inox_promise** out);
inox_status inox_fs_write_file_bytes(inox_loop* loop, const char* path, size_t path_len, inox_value bytes, inox_promise** out);
inox_status
inox_fs_stats_new(inox_allocator* allocator, double size, double mode, double mtime_ms, bool is_file, bool is_directory, inox_value* out);
bool inox_fs_stats_is_file(inox_value stats);
bool inox_fs_stats_is_directory(inox_value stats);
inox_status inox_fs_dirent_new(inox_allocator* allocator, const char* name, size_t name_len, bool is_file, bool is_directory, inox_value* out);
bool inox_fs_dirent_is_file(inox_value dirent);
bool inox_fs_dirent_is_directory(inox_value dirent);

#ifdef __cplusplus
}
#endif

#endif
