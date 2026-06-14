#ifndef CCJS_FS_H
#define CCJS_FS_H

#include <stdbool.h>
#include <stddef.h>
#include "ccjs/loop.h"
#include "ccjs/promise.h"
#include "ccjs/value.h"

enum {
  CCJS_FS_F_OK = 0,
  CCJS_FS_X_OK = 1,
  CCJS_FS_W_OK = 2,
  CCJS_FS_R_OK = 4
};

typedef ccjs_status (*ccjs_fs_read_file_fn)(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
);
typedef ccjs_status (*ccjs_fs_read_file_bytes_fn)(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
);
typedef ccjs_status (*ccjs_fs_read_dir_fn)(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
);
typedef ccjs_status (*ccjs_fs_read_dir_dirents_fn)(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
);
typedef ccjs_status (*ccjs_fs_stat_fn)(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
);
typedef ccjs_status (*ccjs_fs_access_fn)(void* user, const char* path, size_t path_len, int mode);
typedef ccjs_status (*ccjs_fs_mkdir_fn)(void* user, const char* path, size_t path_len, bool recursive);
typedef ccjs_status (*ccjs_fs_unlink_fn)(void* user, const char* path, size_t path_len);
typedef ccjs_status (*ccjs_fs_rm_fn)(void* user, const char* path, size_t path_len, bool recursive, bool force);
typedef ccjs_status (*ccjs_fs_append_file_fn)(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
typedef ccjs_status (*ccjs_fs_copy_file_fn)(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
typedef ccjs_status (*ccjs_fs_rename_fn)(
  void* user,
  const char* old_path,
  size_t old_path_len,
  const char* new_path,
  size_t new_path_len
);
typedef ccjs_status (*ccjs_fs_write_file_fn)(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);

typedef struct ccjs_fs_adapter {
  void* user;
  ccjs_fs_read_file_fn read_file;
  ccjs_fs_write_file_fn write_file;
  ccjs_fs_read_dir_fn read_dir;
  ccjs_fs_read_dir_dirents_fn read_dir_dirents;
  ccjs_fs_read_file_bytes_fn read_file_bytes;
  ccjs_fs_stat_fn stat;
  ccjs_fs_stat_fn lstat;
  ccjs_fs_access_fn access;
  ccjs_fs_mkdir_fn mkdir;
  ccjs_fs_unlink_fn unlink;
  ccjs_fs_rm_fn rm;
  ccjs_fs_append_file_fn append_file;
  ccjs_fs_copy_file_fn copy_file;
  ccjs_fs_rename_fn rename;
} ccjs_fs_adapter;

void ccjs_fs_set_adapter(ccjs_fs_adapter adapter);
ccjs_fs_adapter ccjs_fs_get_adapter(void);
void ccjs_fs_clear_adapter(void);
ccjs_status ccjs_fs_read_file_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_read_file_bytes_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_read_dir_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_read_dir_dirents_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_stat_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_lstat_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_access_sync(const char* path, size_t path_len, int mode);
ccjs_status ccjs_fs_mkdir_sync(const char* path, size_t path_len, bool recursive);
ccjs_status ccjs_fs_unlink_sync(const char* path, size_t path_len);
ccjs_status ccjs_fs_rm_sync(const char* path, size_t path_len, bool recursive, bool force);
ccjs_status ccjs_fs_append_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
ccjs_status ccjs_fs_append_file_bytes_sync(const char* path, size_t path_len, ccjs_value bytes);
ccjs_status ccjs_fs_copy_file_sync(const char* src_path, size_t src_path_len, const char* dest_path, size_t dest_path_len);
ccjs_status ccjs_fs_rename_sync(const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
ccjs_status ccjs_fs_write_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
ccjs_status ccjs_fs_write_file_bytes_sync(const char* path, size_t path_len, ccjs_value bytes);
ccjs_status ccjs_fs_read_file(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_read_file_bytes(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_read_dir(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_read_dir_dirents(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_stat(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_lstat(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_access(ccjs_loop* loop, const char* path, size_t path_len, int mode, ccjs_promise** out);
ccjs_status ccjs_fs_mkdir(ccjs_loop* loop, const char* path, size_t path_len, bool recursive, ccjs_promise** out);
ccjs_status ccjs_fs_unlink(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_rm(ccjs_loop* loop, const char* path, size_t path_len, bool recursive, bool force, ccjs_promise** out);
ccjs_status
ccjs_fs_append_file(ccjs_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, ccjs_promise** out);
ccjs_status ccjs_fs_append_file_bytes(ccjs_loop* loop, const char* path, size_t path_len, ccjs_value bytes, ccjs_promise** out);
ccjs_status ccjs_fs_copy_file(
  ccjs_loop* loop,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len,
  ccjs_promise** out
);
ccjs_status
ccjs_fs_rename(ccjs_loop* loop, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len, ccjs_promise** out);
ccjs_status
ccjs_fs_write_file(ccjs_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, ccjs_promise** out);
ccjs_status ccjs_fs_write_file_bytes(ccjs_loop* loop, const char* path, size_t path_len, ccjs_value bytes, ccjs_promise** out);
ccjs_status
ccjs_fs_stats_new(ccjs_allocator* allocator, double size, double mode, double mtime_ms, bool is_file, bool is_directory, ccjs_value* out);
bool ccjs_fs_stats_is_file(ccjs_value stats);
bool ccjs_fs_stats_is_directory(ccjs_value stats);
ccjs_status ccjs_fs_dirent_new(ccjs_allocator* allocator, const char* name, size_t name_len, bool is_file, bool is_directory, ccjs_value* out);
bool ccjs_fs_dirent_is_file(ccjs_value dirent);
bool ccjs_fs_dirent_is_directory(ccjs_value dirent);

#endif
