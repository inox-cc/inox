#include <stdint.h>
#include <string.h>
#include "ccjs/array.h"
#include "ccjs/binary.h"
#include "ccjs/fs.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include <limits.h>
#include "../async/loop-libuv-internal.h"
#endif

#if !defined(CCJS_FS_DISABLE_HOST) || defined(CCJS_LOOP_BACKEND_LIBUV)
#include <stdlib.h>
#include <sys/stat.h>
#endif

#ifndef CCJS_FS_DISABLE_HOST
#include <errno.h>
#ifndef _WIN32
#include <dirent.h>
#include <unistd.h>
#else
#include <direct.h>
#include <io.h>
#endif
#include <stdio.h>
#endif

typedef enum ccjs_fs_request_kind {
  CCJS_FS_REQUEST_READ_FILE,
  CCJS_FS_REQUEST_READ_FILE_BYTES,
  CCJS_FS_REQUEST_READ_DIR,
  CCJS_FS_REQUEST_READ_DIR_DIRENTS,
  CCJS_FS_REQUEST_STAT,
  CCJS_FS_REQUEST_LSTAT,
  CCJS_FS_REQUEST_REALPATH,
  CCJS_FS_REQUEST_READLINK,
  CCJS_FS_REQUEST_ACCESS,
  CCJS_FS_REQUEST_MKDIR,
  CCJS_FS_REQUEST_UNLINK,
  CCJS_FS_REQUEST_RM,
  CCJS_FS_REQUEST_APPEND_FILE,
  CCJS_FS_REQUEST_COPY_FILE,
  CCJS_FS_REQUEST_SYMLINK,
  CCJS_FS_REQUEST_RENAME,
  CCJS_FS_REQUEST_WRITE_FILE
} ccjs_fs_request_kind;

typedef struct ccjs_fs_request {
  ccjs_loop* loop;
  ccjs_promise* promise;
  ccjs_fs_request_kind kind;
  char* path;
  size_t path_len;
  char* path2;
  size_t path2_len;
  char* bytes;
  size_t byte_len;
  int mode;
  bool recursive;
  bool force;
} ccjs_fs_request;

static ccjs_fs_adapter ccjs_fs_active_adapter = { 0 };

static ccjs_status ccjs_fs_copy_bytes(ccjs_allocator* allocator, const char* bytes, size_t len, char** out);
#if !defined(CCJS_FS_DISABLE_HOST) || defined(CCJS_LOOP_BACKEND_LIBUV)
static ccjs_status ccjs_fs_copy_host_bytes(const char* bytes, size_t len, char** out);
#endif
#ifdef CCJS_LOOP_BACKEND_LIBUV
static ccjs_status ccjs_fs_libuv_read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status
ccjs_fs_libuv_read_file_bytes(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status
ccjs_fs_libuv_read_dir_dirents(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_stat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_lstat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_realpath(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_readlink(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_access(void* user, const char* path, size_t path_len, int mode);
static ccjs_status ccjs_fs_libuv_mkdir(void* user, const char* path, size_t path_len, bool recursive);
static ccjs_status ccjs_fs_libuv_unlink(void* user, const char* path, size_t path_len);
static ccjs_status ccjs_fs_libuv_rm(void* user, const char* path, size_t path_len, bool recursive, bool force);
static ccjs_status ccjs_fs_libuv_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
static ccjs_status ccjs_fs_libuv_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
static ccjs_status ccjs_fs_libuv_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len);
static ccjs_status
ccjs_fs_libuv_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
static ccjs_status ccjs_fs_libuv_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
static ccjs_status ccjs_fs_libuv_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len);
static ccjs_status ccjs_fs_libuv_queue_request(
  ccjs_loop* loop,
  ccjs_fs_request_kind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  ccjs_promise** out
);
#endif
#ifndef CCJS_FS_DISABLE_HOST
static ccjs_status ccjs_fs_default_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len);
static ccjs_status
ccjs_fs_default_read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status
ccjs_fs_default_read_file_bytes(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status
ccjs_fs_default_read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status
ccjs_fs_default_read_dir_dirents(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_stat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_lstat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_realpath(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_readlink(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_access(void* user, const char* path, size_t path_len, int mode);
static ccjs_status ccjs_fs_default_mkdir(void* user, const char* path, size_t path_len, bool recursive);
static ccjs_status ccjs_fs_default_unlink(void* user, const char* path, size_t path_len);
static ccjs_status ccjs_fs_default_rm(void* user, const char* path, size_t path_len, bool recursive, bool force);
static ccjs_status ccjs_fs_default_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
static ccjs_status ccjs_fs_default_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
static ccjs_status ccjs_fs_default_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len);
static ccjs_status
ccjs_fs_default_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
static ccjs_status ccjs_fs_default_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
#endif
static ccjs_status ccjs_fs_queue_request(
  ccjs_loop* loop,
  ccjs_fs_request_kind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  ccjs_promise** out
);
static ccjs_status ccjs_fs_run_request(void* context);
static ccjs_status ccjs_fs_reject_status(ccjs_loop* loop, ccjs_promise* promise, ccjs_status status);
static ccjs_status ccjs_fs_error_from_status(ccjs_allocator* allocator, ccjs_status status, ccjs_value* out);
static const char* ccjs_fs_error_code(ccjs_status status);
static const char* ccjs_fs_error_message(ccjs_status status);
static void ccjs_fs_request_finalizer(void* context);

void ccjs_fs_set_adapter(ccjs_fs_adapter adapter) {
  ccjs_fs_active_adapter = adapter;
}

ccjs_fs_adapter ccjs_fs_get_adapter(void) {
  return ccjs_fs_active_adapter;
}

void ccjs_fs_clear_adapter(void) {
  ccjs_fs_adapter adapter = { 0 };
  ccjs_fs_active_adapter = adapter;
}

enum {
  CCJS_FS_STATS_SIZE_INDEX = 0,
  CCJS_FS_STATS_MODE_INDEX = 1,
  CCJS_FS_STATS_MTIME_MS_INDEX = 2,
  CCJS_FS_STATS_IS_FILE_INDEX = 3,
  CCJS_FS_STATS_IS_DIRECTORY_INDEX = 4
};

static ccjs_status ccjs_fs_stats_bool_field(ccjs_value stats, uint32_t index, bool* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = false;
  ccjs_value value = ccjs_undefined_value();
  ccjs_status status = ccjs_object_get_known(stats, index, &value);

  if (status != CCJS_OK) {
    return status;
  }

  if (value.tag != CCJS_TAG_BOOL) {
    ccjs_release(value);
    return CCJS_ERR_TYPE;
  }

  *out = value.as.boolean;
  ccjs_release(value);

  return CCJS_OK;
}

bool ccjs_fs_stats_is_file(ccjs_value stats) {
  bool result = false;

  return ccjs_fs_stats_bool_field(stats, CCJS_FS_STATS_IS_FILE_INDEX, &result) == CCJS_OK && result;
}

bool ccjs_fs_stats_is_directory(ccjs_value stats) {
  bool result = false;

  return ccjs_fs_stats_bool_field(stats, CCJS_FS_STATS_IS_DIRECTORY_INDEX, &result) == CCJS_OK && result;
}

ccjs_status
ccjs_fs_stats_new(ccjs_allocator* allocator, double size, double mode, double mtime_ms, bool is_file, bool is_directory, ccjs_value* out) {
  static const ccjs_field_info fields[] = { { "size", CCJS_FIELD_READONLY },
                                            { "mode", CCJS_FIELD_READONLY },
                                            { "mtimeMs", CCJS_FIELD_READONLY },
                                            { "__ccjsIsFile", CCJS_FIELD_READONLY },
                                            { "__ccjsIsDirectory", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 5, fields };

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value stats = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, &shape, &stats);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(stats, CCJS_FS_STATS_SIZE_INDEX, ccjs_number_value(size));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(stats, CCJS_FS_STATS_MODE_INDEX, ccjs_number_value(mode));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(stats, CCJS_FS_STATS_MTIME_MS_INDEX, ccjs_number_value(mtime_ms));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(stats, CCJS_FS_STATS_IS_FILE_INDEX, ccjs_bool_value(is_file));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(stats, CCJS_FS_STATS_IS_DIRECTORY_INDEX, ccjs_bool_value(is_directory));
  }

  if (status != CCJS_OK) {
    ccjs_release(stats);
    return status;
  }

  *out = stats;

  return CCJS_OK;
}

enum {
  CCJS_FS_DIRENT_NAME_INDEX = 0,
  CCJS_FS_DIRENT_IS_FILE_INDEX = 1,
  CCJS_FS_DIRENT_IS_DIRECTORY_INDEX = 2
};

static ccjs_status ccjs_fs_dirent_bool_field(ccjs_value dirent, uint32_t index, bool* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = false;
  ccjs_value value = ccjs_undefined_value();
  ccjs_status status = ccjs_object_get_known(dirent, index, &value);

  if (status != CCJS_OK) {
    return status;
  }

  if (value.tag != CCJS_TAG_BOOL) {
    ccjs_release(value);
    return CCJS_ERR_TYPE;
  }

  *out = value.as.boolean;
  ccjs_release(value);

  return CCJS_OK;
}

bool ccjs_fs_dirent_is_file(ccjs_value dirent) {
  bool result = false;

  return ccjs_fs_dirent_bool_field(dirent, CCJS_FS_DIRENT_IS_FILE_INDEX, &result) == CCJS_OK && result;
}

bool ccjs_fs_dirent_is_directory(ccjs_value dirent) {
  bool result = false;

  return ccjs_fs_dirent_bool_field(dirent, CCJS_FS_DIRENT_IS_DIRECTORY_INDEX, &result) == CCJS_OK && result;
}

ccjs_status ccjs_fs_dirent_new(
  ccjs_allocator* allocator,
  const char* name,
  size_t name_len,
  bool is_file,
  bool is_directory,
  ccjs_value* out
) {
  static const ccjs_field_info fields[] = { { "name", CCJS_FIELD_READONLY },
                                            { "__ccjsIsFile", CCJS_FIELD_READONLY },
                                            { "__ccjsIsDirectory", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 3, fields };

  if (allocator == 0 || out == 0 || (name == 0 && name_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value dirent = ccjs_undefined_value();
  ccjs_value name_value = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, &shape, &dirent);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, name == 0 ? "" : name, name_len, &name_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(dirent, CCJS_FS_DIRENT_NAME_INDEX, name_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(dirent, CCJS_FS_DIRENT_IS_FILE_INDEX, ccjs_bool_value(is_file));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(dirent, CCJS_FS_DIRENT_IS_DIRECTORY_INDEX, ccjs_bool_value(is_directory));
  }

  ccjs_release(name_value);

  if (status != CCJS_OK) {
    ccjs_release(dirent);
    return status;
  }

  *out = dirent;

  return CCJS_OK;
}

ccjs_status ccjs_fs_read_file_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.read_file != 0) {
    return ccjs_fs_active_adapter.read_file(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_read_file(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_read_file(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_read_file_bytes_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.read_file_bytes != 0) {
    return ccjs_fs_active_adapter.read_file_bytes(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_read_file_bytes(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_read_file_bytes(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_read_dir_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.read_dir != 0) {
    return ccjs_fs_active_adapter.read_dir(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_read_dir(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_read_dir(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_read_dir_dirents_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.read_dir_dirents != 0) {
    return ccjs_fs_active_adapter.read_dir_dirents(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_read_dir_dirents(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_read_dir_dirents(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_stat_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.stat != 0) {
    return ccjs_fs_active_adapter.stat(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_stat(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_stat(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_lstat_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.lstat != 0) {
    return ccjs_fs_active_adapter.lstat(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_lstat(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_lstat(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_realpath_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.realpath != 0) {
    return ccjs_fs_active_adapter.realpath(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_realpath(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_realpath(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_readlink_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.readlink != 0) {
    return ccjs_fs_active_adapter.readlink(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_readlink(0, allocator, path, path_len, out);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_readlink(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_access_sync(const char* path, size_t path_len, int mode) {
  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.access != 0) {
    return ccjs_fs_active_adapter.access(ccjs_fs_active_adapter.user, path, path_len, mode);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_access(0, path, path_len, mode);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_access(0, path, path_len, mode);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_mkdir_sync(const char* path, size_t path_len, bool recursive) {
  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.mkdir != 0) {
    return ccjs_fs_active_adapter.mkdir(ccjs_fs_active_adapter.user, path, path_len, recursive);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_mkdir(0, path, path_len, recursive);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_mkdir(0, path, path_len, recursive);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_unlink_sync(const char* path, size_t path_len) {
  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.unlink != 0) {
    return ccjs_fs_active_adapter.unlink(ccjs_fs_active_adapter.user, path, path_len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_unlink(0, path, path_len);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_unlink(0, path, path_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_rm_sync(const char* path, size_t path_len, bool recursive, bool force) {
  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.rm != 0) {
    return ccjs_fs_active_adapter.rm(ccjs_fs_active_adapter.user, path, path_len, recursive, force);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_rm(0, path, path_len, recursive, force);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_rm(0, path, path_len, recursive, force);
#else
  return force ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_append_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  if ((path == 0 && path_len != 0) || (bytes == 0 && byte_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.append_file != 0) {
    return ccjs_fs_active_adapter.append_file(ccjs_fs_active_adapter.user, path, path_len, bytes, byte_len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_append_file(0, path, path_len, bytes, byte_len);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_append_file(0, path, path_len, bytes, byte_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_append_file_bytes_sync(const char* path, size_t path_len, ccjs_value bytes) {
  if (bytes.tag != CCJS_TAG_BYTES || bytes.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* data = (ccjs_bytes*)bytes.as.ref;

  return ccjs_fs_append_file_sync(path, path_len, (const char*)data->bytes, data->len);
}

ccjs_status ccjs_fs_copy_file_sync(const char* src_path, size_t src_path_len, const char* dest_path, size_t dest_path_len) {
  if ((src_path == 0 && src_path_len != 0) || (dest_path == 0 && dest_path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.copy_file != 0) {
    return ccjs_fs_active_adapter.copy_file(ccjs_fs_active_adapter.user, src_path, src_path_len, dest_path, dest_path_len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_copy_file(0, src_path, src_path_len, dest_path, dest_path_len);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_copy_file(0, src_path, src_path_len, dest_path, dest_path_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_symlink_sync(const char* target, size_t target_len, const char* path, size_t path_len) {
  if ((target == 0 && target_len != 0) || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.symlink != 0) {
    return ccjs_fs_active_adapter.symlink(ccjs_fs_active_adapter.user, target, target_len, path, path_len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_symlink(0, target, target_len, path, path_len);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_symlink(0, target, target_len, path, path_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_rename_sync(const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len) {
  if ((old_path == 0 && old_path_len != 0) || (new_path == 0 && new_path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.rename != 0) {
    return ccjs_fs_active_adapter.rename(ccjs_fs_active_adapter.user, old_path, old_path_len, new_path, new_path_len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_rename(0, old_path, old_path_len, new_path, new_path_len);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_rename(0, old_path, old_path_len, new_path, new_path_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_write_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  if ((path == 0 && path_len != 0) || (bytes == 0 && byte_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.write_file != 0) {
    return ccjs_fs_active_adapter.write_file(ccjs_fs_active_adapter.user, path, path_len, bytes, byte_len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_fs_libuv_write_file(0, path, path_len, bytes, byte_len);
#endif

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_write_file(0, path, path_len, bytes, byte_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_write_file_bytes_sync(const char* path, size_t path_len, ccjs_value bytes) {
  if (bytes.tag != CCJS_TAG_BYTES || bytes.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* data = (ccjs_bytes*)bytes.as.ref;

  return ccjs_fs_write_file_sync(path, path_len, (const char*)data->bytes, data->len);
}

ccjs_status ccjs_fs_read_file(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.read_file == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_READ_FILE, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READ_FILE, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_read_file_bytes(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.read_file_bytes == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_READ_FILE_BYTES, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READ_FILE_BYTES, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_read_dir(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.read_dir == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_READ_DIR, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READ_DIR, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_read_dir_dirents(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.read_dir_dirents == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_READ_DIR_DIRENTS, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READ_DIR_DIRENTS, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_stat(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.stat == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_STAT, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_STAT, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_lstat(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.lstat == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_LSTAT, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_LSTAT, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_realpath(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.realpath == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_REALPATH, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_REALPATH, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_readlink(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.readlink == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_READLINK, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READLINK, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_access(ccjs_loop* loop, const char* path, size_t path_len, int mode, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.access == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_ACCESS, path, path_len, 0, 0, 0, 0, mode, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_ACCESS, path, path_len, 0, 0, 0, 0, mode, false, false, out);
}

ccjs_status ccjs_fs_mkdir(ccjs_loop* loop, const char* path, size_t path_len, bool recursive, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.mkdir == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_MKDIR, path, path_len, 0, 0, 0, 0, 0, recursive, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_MKDIR, path, path_len, 0, 0, 0, 0, 0, recursive, false, out);
}

ccjs_status ccjs_fs_unlink(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.unlink == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_UNLINK, path, path_len, 0, 0, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_UNLINK, path, path_len, 0, 0, 0, 0, 0, false, false, out);
}

ccjs_status ccjs_fs_rm(ccjs_loop* loop, const char* path, size_t path_len, bool recursive, bool force, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.rm == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_RM, path, path_len, 0, 0, 0, 0, 0, recursive, force, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_RM, path, path_len, 0, 0, 0, 0, 0, recursive, force, out);
}

ccjs_status
ccjs_fs_append_file(ccjs_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.append_file == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_APPEND_FILE, path, path_len, 0, 0, bytes, byte_len, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_APPEND_FILE, path, path_len, 0, 0, bytes, byte_len, 0, false, false, out);
}

ccjs_status ccjs_fs_append_file_bytes(ccjs_loop* loop, const char* path, size_t path_len, ccjs_value bytes, ccjs_promise** out) {
  if (out != 0) {
    *out = 0;
  }

  if (bytes.tag != CCJS_TAG_BYTES || bytes.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* data = (ccjs_bytes*)bytes.as.ref;

#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.append_file == 0) {
    return ccjs_fs_libuv_queue_request(
      loop, CCJS_FS_REQUEST_APPEND_FILE, path, path_len, 0, 0, (const char*)data->bytes, data->len, 0, false, false, out
    );
  }
#endif

  return ccjs_fs_queue_request(
    loop, CCJS_FS_REQUEST_APPEND_FILE, path, path_len, 0, 0, (const char*)data->bytes, data->len, 0, false, false, out
  );
}

ccjs_status ccjs_fs_copy_file(
  ccjs_loop* loop,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len,
  ccjs_promise** out
) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.copy_file == 0) {
    return ccjs_fs_libuv_queue_request(
      loop, CCJS_FS_REQUEST_COPY_FILE, src_path, src_path_len, dest_path, dest_path_len, 0, 0, 0, false, false, out
    );
  }
#endif

  return ccjs_fs_queue_request(
    loop, CCJS_FS_REQUEST_COPY_FILE, src_path, src_path_len, dest_path, dest_path_len, 0, 0, 0, false, false, out
  );
}

ccjs_status
ccjs_fs_symlink(ccjs_loop* loop, const char* target, size_t target_len, const char* path, size_t path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.symlink == 0) {
    return ccjs_fs_libuv_queue_request(
      loop, CCJS_FS_REQUEST_SYMLINK, target, target_len, path, path_len, 0, 0, 0, false, false, out
    );
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_SYMLINK, target, target_len, path, path_len, 0, 0, 0, false, false, out);
}

ccjs_status
ccjs_fs_rename(ccjs_loop* loop, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.rename == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_RENAME, old_path, old_path_len, new_path, new_path_len, 0, 0, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_RENAME, old_path, old_path_len, new_path, new_path_len, 0, 0, 0, false, false, out);
}

ccjs_status
ccjs_fs_write_file(ccjs_loop* loop, const char* path, size_t path_len, const char* bytes, size_t byte_len, ccjs_promise** out) {
#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.write_file == 0) {
    return ccjs_fs_libuv_queue_request(loop, CCJS_FS_REQUEST_WRITE_FILE, path, path_len, 0, 0, bytes, byte_len, 0, false, false, out);
  }
#endif

  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_WRITE_FILE, path, path_len, 0, 0, bytes, byte_len, 0, false, false, out);
}

ccjs_status ccjs_fs_write_file_bytes(ccjs_loop* loop, const char* path, size_t path_len, ccjs_value bytes, ccjs_promise** out) {
  if (out != 0) {
    *out = 0;
  }

  if (bytes.tag != CCJS_TAG_BYTES || bytes.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* data = (ccjs_bytes*)bytes.as.ref;

#ifdef CCJS_LOOP_BACKEND_LIBUV
  if (ccjs_fs_active_adapter.write_file == 0) {
    return ccjs_fs_libuv_queue_request(
      loop, CCJS_FS_REQUEST_WRITE_FILE, path, path_len, 0, 0, (const char*)data->bytes, data->len, 0, false, false, out
    );
  }
#endif

  return ccjs_fs_queue_request(
    loop, CCJS_FS_REQUEST_WRITE_FILE, path, path_len, 0, 0, (const char*)data->bytes, data->len, 0, false, false, out
  );
}

static ccjs_status ccjs_fs_copy_bytes(ccjs_allocator* allocator, const char* bytes, size_t len, char** out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (allocator == 0 || allocator->alloc == 0 || len == ((size_t)-1)) {
    return CCJS_ERR_TYPE;
  }

  char* copy = allocator->alloc(allocator->user, len + 1, _Alignof(char));

  if (copy == 0) {
    return CCJS_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  copy[len] = '\0';
  *out = copy;

  return CCJS_OK;
}

#if !defined(CCJS_FS_DISABLE_HOST) || defined(CCJS_LOOP_BACKEND_LIBUV)
static ccjs_status ccjs_fs_copy_host_bytes(const char* bytes, size_t len, char** out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (len == ((size_t)-1)) {
    return CCJS_ERR_OOM;
  }

  char* copy = malloc(len + 1);

  if (copy == 0) {
    return CCJS_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  copy[len] = '\0';
  *out = copy;

  return CCJS_OK;
}
#endif

#ifdef CCJS_LOOP_BACKEND_LIBUV
typedef enum ccjs_fs_libuv_stage {
  CCJS_FS_LIBUV_STAGE_OPEN,
  CCJS_FS_LIBUV_STAGE_FSTAT,
  CCJS_FS_LIBUV_STAGE_READ,
  CCJS_FS_LIBUV_STAGE_WRITE,
  CCJS_FS_LIBUV_STAGE_CLOSE,
  CCJS_FS_LIBUV_STAGE_SCANDIR,
  CCJS_FS_LIBUV_STAGE_STAT,
  CCJS_FS_LIBUV_STAGE_LSTAT,
  CCJS_FS_LIBUV_STAGE_REALPATH,
  CCJS_FS_LIBUV_STAGE_READLINK,
  CCJS_FS_LIBUV_STAGE_ACCESS,
  CCJS_FS_LIBUV_STAGE_MKDIR,
  CCJS_FS_LIBUV_STAGE_UNLINK,
  CCJS_FS_LIBUV_STAGE_RM,
  CCJS_FS_LIBUV_STAGE_COPY_FILE,
  CCJS_FS_LIBUV_STAGE_SYMLINK,
  CCJS_FS_LIBUV_STAGE_RENAME
} ccjs_fs_libuv_stage;

typedef struct ccjs_fs_libuv_request {
  ccjs_loop* loop;
  ccjs_promise* promise;
  ccjs_fs_request_kind kind;
  ccjs_fs_libuv_stage stage;
  uv_fs_t req;
  uv_file file;
  int file_open;
  char* path;
  size_t path_len;
  char* path2;
  size_t path2_len;
  char* bytes;
  size_t byte_len;
  size_t byte_offset;
  int mode;
  bool recursive;
  bool force;
  char* data;
  size_t data_len;
  size_t data_cap;
  ccjs_status close_status;
} ccjs_fs_libuv_request;

static ccjs_status ccjs_fs_status_from_uv(ssize_t result);
static ccjs_status ccjs_fs_libuv_close_sync(uv_file file, ccjs_status status);
static ccjs_status ccjs_fs_stats_from_uv(ccjs_allocator* allocator, const uv_stat_t* stat, ccjs_value* out);
static double ccjs_fs_uv_mtime_ms(const uv_stat_t* stat);
static ccjs_status ccjs_fs_libuv_read_dir_entries(uv_fs_t* req, ccjs_allocator* allocator, bool with_file_types, ccjs_value* out);
static ccjs_status ccjs_fs_libuv_start_request(ccjs_fs_libuv_request* request);
static ccjs_status ccjs_fs_libuv_start_open(ccjs_fs_libuv_request* request, int flags, int mode);
static ccjs_status ccjs_fs_libuv_start_fstat(ccjs_fs_libuv_request* request);
static ccjs_status ccjs_fs_libuv_start_read(ccjs_fs_libuv_request* request);
static ccjs_status ccjs_fs_libuv_start_write(ccjs_fs_libuv_request* request);
static ccjs_status ccjs_fs_libuv_start_close(ccjs_fs_libuv_request* request, ccjs_status close_status);
static ccjs_status ccjs_fs_libuv_settle(ccjs_fs_libuv_request* request, ccjs_status status);
static ccjs_status ccjs_fs_libuv_settle_value(ccjs_fs_libuv_request* request, ccjs_status status, ccjs_value value);
static ccjs_status ccjs_fs_libuv_settle_after_close(ccjs_fs_libuv_request* request, ccjs_status status);
static void ccjs_fs_libuv_cb(uv_fs_t* req);
static void ccjs_fs_libuv_request_finalizer(ccjs_fs_libuv_request* request);

static ccjs_status ccjs_fs_status_from_uv(ssize_t result) {
  if (result >= 0) {
    return CCJS_OK;
  }

  if (result == UV_ENOMEM) {
    return CCJS_ERR_OOM;
  }

  if (result == UV_EINVAL) {
    return CCJS_ERR_TYPE;
  }

  if (result == UV_EACCES || result == UV_EPERM || result == UV_EROFS) {
    return CCJS_ERR_READONLY;
  }

  return CCJS_ERR_FIELD;
}

static ccjs_status ccjs_fs_libuv_close_sync(uv_file file, ccjs_status status) {
  uv_fs_t close_req;
  int close_result = uv_fs_close(0, &close_req, file, 0);
  uv_fs_req_cleanup(&close_req);

  if (status != CCJS_OK) {
    return status;
  }

  return ccjs_fs_status_from_uv(close_result);
}

static double ccjs_fs_uv_mtime_ms(const uv_stat_t* stat) {
  if (stat == 0) {
    return 0;
  }

  return ((double)stat->st_mtim.tv_sec * 1000.0) + ((double)stat->st_mtim.tv_nsec / 1000000.0);
}

static ccjs_status ccjs_fs_stats_from_uv(ccjs_allocator* allocator, const uv_stat_t* stat, ccjs_value* out) {
  if (stat == 0) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_fs_stats_new(
    allocator,
    (double)stat->st_size,
    (double)stat->st_mode,
    ccjs_fs_uv_mtime_ms(stat),
    S_ISREG(stat->st_mode),
    S_ISDIR(stat->st_mode),
    out
  );
}

static ccjs_status ccjs_fs_libuv_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len) {
  if (out_bytes == 0 || out_len == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out_bytes = 0;
  *out_len = 0;

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t open_req;
  int open_result = uv_fs_open(0, &open_req, path_copy, UV_FS_O_RDONLY, 0, 0);
  uv_fs_req_cleanup(&open_req);
  free(path_copy);

  if (open_result < 0) {
    return ccjs_fs_status_from_uv(open_result);
  }

  uv_file file = (uv_file)open_result;
  uv_fs_t stat_req;
  int stat_result = uv_fs_fstat(0, &stat_req, file, 0);

  if (stat_result < 0) {
    uv_fs_req_cleanup(&stat_req);
    return ccjs_fs_libuv_close_sync(file, ccjs_fs_status_from_uv(stat_result));
  }

  uint64_t file_size = uv_fs_get_statbuf(&stat_req)->st_size;
  uv_fs_req_cleanup(&stat_req);

  if (file_size > (uint64_t)INT64_MAX || file_size > (uint64_t)(SIZE_MAX - 1)) {
    return ccjs_fs_libuv_close_sync(file, CCJS_ERR_OOM);
  }

  size_t byte_len = (size_t)file_size;
  char* buffer = 0;

  if (byte_len != 0) {
    buffer = malloc(byte_len + 1);

    if (buffer == 0) {
      return ccjs_fs_libuv_close_sync(file, CCJS_ERR_OOM);
    }
  }

  size_t offset = 0;

  while (offset < byte_len) {
    size_t remaining = byte_len - offset;
    unsigned int chunk_len = remaining > (size_t)UINT_MAX ? UINT_MAX : (unsigned int)remaining;
    uv_buf_t buffer_slice = uv_buf_init(buffer + offset, chunk_len);
    uv_fs_t read_req;
    int read_result = uv_fs_read(0, &read_req, file, &buffer_slice, 1, (int64_t)offset, 0);
    uv_fs_req_cleanup(&read_req);

    if (read_result < 0) {
      free(buffer);
      return ccjs_fs_libuv_close_sync(file, ccjs_fs_status_from_uv(read_result));
    }

    if (read_result == 0) {
      break;
    }

    offset += (size_t)read_result;
  }

  if (buffer != 0) {
    buffer[offset] = '\0';
  }

  status = ccjs_fs_libuv_close_sync(file, CCJS_OK);

  if (status != CCJS_OK) {
    free(buffer);
    return status;
  }

  *out_bytes = buffer;
  *out_len = offset;

  return CCJS_OK;
}

static ccjs_status
ccjs_fs_libuv_read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  ccjs_status status = ccjs_fs_libuv_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, buffer == 0 ? "" : buffer, byte_len, out);
  }

  free(buffer);

  return status;
}

static ccjs_status
ccjs_fs_libuv_read_file_bytes(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  ccjs_status status = ccjs_fs_libuv_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == CCJS_OK) {
    status = ccjs_bytes_from_data(allocator, (const uint8_t*)buffer, byte_len, out);
  }

  free(buffer);

  return status;
}

static ccjs_status ccjs_fs_libuv_read_dir_entries(uv_fs_t* req, ccjs_allocator* allocator, bool with_file_types, ccjs_value* out) {
  if (req == 0 || allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_value entries = ccjs_undefined_value();
  ccjs_status status = ccjs_array_new(allocator, 0, &entries);

  if (status != CCJS_OK) {
    return status;
  }

  uv_dirent_t entry;
  int next_result = uv_fs_scandir_next(req, &entry);

  while (next_result != UV_EOF) {
    if (next_result < 0) {
      ccjs_release(entries);
      return ccjs_fs_status_from_uv(next_result);
    }

    ccjs_value value = ccjs_undefined_value();
    size_t name_len = strlen(entry.name);

    if (with_file_types) {
      status = ccjs_fs_dirent_new(
        allocator,
        entry.name,
        name_len,
        entry.type == UV_DIRENT_FILE,
        entry.type == UV_DIRENT_DIR,
        &value
      );
    } else {
      status = ccjs_string_from_literal(allocator, entry.name, name_len, &value);
    }

    if (status == CCJS_OK) {
      status = ccjs_array_push(entries, value);
    }

    ccjs_release(value);

    if (status != CCJS_OK) {
      ccjs_release(entries);
      return status;
    }

    next_result = uv_fs_scandir_next(req, &entry);
  }

  *out = entries;

  return CCJS_OK;
}

static ccjs_status ccjs_fs_libuv_read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t scan_req;
  int scan_result = uv_fs_scandir(0, &scan_req, path_copy, 0, 0);
  free(path_copy);

  if (scan_result < 0) {
    uv_fs_req_cleanup(&scan_req);
    return ccjs_fs_status_from_uv(scan_result);
  }

  status = ccjs_fs_libuv_read_dir_entries(&scan_req, allocator, false, out);
  uv_fs_req_cleanup(&scan_req);

  return status;
}

static ccjs_status ccjs_fs_libuv_read_dir_dirents(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t scan_req;
  int scan_result = uv_fs_scandir(0, &scan_req, path_copy, 0, 0);
  free(path_copy);

  if (scan_result < 0) {
    uv_fs_req_cleanup(&scan_req);
    return ccjs_fs_status_from_uv(scan_result);
  }

  status = ccjs_fs_libuv_read_dir_entries(&scan_req, allocator, true, out);
  uv_fs_req_cleanup(&scan_req);

  return status;
}

static ccjs_status ccjs_fs_libuv_stat_like(
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out,
  bool follow_symlink
) {
  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t stat_req;
  int stat_result = follow_symlink ? uv_fs_stat(0, &stat_req, path_copy, 0) : uv_fs_lstat(0, &stat_req, path_copy, 0);
  free(path_copy);

  if (stat_result < 0) {
    uv_fs_req_cleanup(&stat_req);
    return ccjs_fs_status_from_uv(stat_result);
  }

  status = ccjs_fs_stats_from_uv(allocator, uv_fs_get_statbuf(&stat_req), out);
  uv_fs_req_cleanup(&stat_req);

  return status;
}

static ccjs_status ccjs_fs_libuv_stat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  return ccjs_fs_libuv_stat_like(allocator, path, path_len, out, true);
}

static ccjs_status ccjs_fs_libuv_lstat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  return ccjs_fs_libuv_stat_like(allocator, path, path_len, out, false);
}

static ccjs_status ccjs_fs_libuv_string_path_result(
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out,
  bool realpath_result
) {
  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t req;
  int result = realpath_result ? uv_fs_realpath(0, &req, path_copy, 0) : uv_fs_readlink(0, &req, path_copy, 0);
  free(path_copy);

  if (result < 0) {
    uv_fs_req_cleanup(&req);
    return ccjs_fs_status_from_uv(result);
  }

  const char* text = (const char*)req.ptr;
  status = ccjs_string_from_literal(allocator, text == 0 ? "" : text, text == 0 ? 0 : strlen(text), out);
  uv_fs_req_cleanup(&req);

  return status;
}

static ccjs_status ccjs_fs_libuv_realpath(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  return ccjs_fs_libuv_string_path_result(allocator, path, path_len, out, true);
}

static ccjs_status ccjs_fs_libuv_readlink(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  return ccjs_fs_libuv_string_path_result(allocator, path, path_len, out, false);
}

static ccjs_status ccjs_fs_libuv_access(void* user, const char* path, size_t path_len, int mode) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t access_req;
  int access_result = uv_fs_access(0, &access_req, path_copy, mode, 0);
  free(path_copy);
  uv_fs_req_cleanup(&access_req);

  return ccjs_fs_status_from_uv(access_result);
}

static ccjs_status ccjs_fs_libuv_mkdir_one(const char* path) {
  uv_fs_t req;
  int result = uv_fs_mkdir(0, &req, path, 0777, 0);
  uv_fs_req_cleanup(&req);

  return result == 0 || result == UV_EEXIST ? CCJS_OK : ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_mkdir_recursive(char* path) {
  if (path == 0 || path[0] == '\0') {
    return CCJS_ERR_TYPE;
  }

  for (char* cursor = path + 1; *cursor != '\0'; cursor += 1) {
    if (*cursor != '/' && *cursor != '\\') {
      continue;
    }

    char saved = *cursor;
    *cursor = '\0';

    if (path[0] != '\0') {
      ccjs_status status = ccjs_fs_libuv_mkdir_one(path);

      if (status != CCJS_OK) {
        *cursor = saved;
        return status;
      }
    }

    *cursor = saved;
  }

  return ccjs_fs_libuv_mkdir_one(path);
}

static ccjs_status ccjs_fs_libuv_mkdir(void* user, const char* path, size_t path_len, bool recursive) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  status = recursive ? ccjs_fs_libuv_mkdir_recursive(path_copy) : ccjs_fs_libuv_mkdir_one(path_copy);
  free(path_copy);

  return status;
}

static ccjs_status ccjs_fs_libuv_unlink(void* user, const char* path, size_t path_len) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_unlink(0, &req, path_copy, 0);
  uv_fs_req_cleanup(&req);
  free(path_copy);

  return ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_rm_path(char* path, bool recursive, bool force) {
  uv_fs_t unlink_req;
  int unlink_result = uv_fs_unlink(0, &unlink_req, path, 0);
  uv_fs_req_cleanup(&unlink_req);

  if (unlink_result == 0) {
    return CCJS_OK;
  }

  if (unlink_result == UV_ENOENT && force) {
    return CCJS_OK;
  }

  if (!recursive) {
    return ccjs_fs_status_from_uv(unlink_result);
  }

  uv_fs_t scan_req;
  int scan_result = uv_fs_scandir(0, &scan_req, path, 0, 0);

  if (scan_result < 0) {
    uv_fs_req_cleanup(&scan_req);
    return scan_result == UV_ENOENT && force ? CCJS_OK : ccjs_fs_status_from_uv(scan_result);
  }

  uv_dirent_t entry;
  int next_result = uv_fs_scandir_next(&scan_req, &entry);

  while (next_result != UV_EOF) {
    if (next_result < 0) {
      uv_fs_req_cleanup(&scan_req);
      return ccjs_fs_status_from_uv(next_result);
    }

    size_t path_len = strlen(path);
    size_t name_len = strlen(entry.name);
    char* child = malloc(path_len + 1 + name_len + 1);

    if (child == 0) {
      uv_fs_req_cleanup(&scan_req);
      return CCJS_ERR_OOM;
    }

    memcpy(child, path, path_len);
    child[path_len] = '/';
    memcpy(child + path_len + 1, entry.name, name_len + 1);
    ccjs_status child_status =
      entry.type == UV_DIRENT_DIR ? ccjs_fs_libuv_rm_path(child, true, force) : ccjs_fs_libuv_rm_path(child, false, force);
    free(child);

    if (child_status != CCJS_OK) {
      uv_fs_req_cleanup(&scan_req);
      return child_status;
    }

    next_result = uv_fs_scandir_next(&scan_req, &entry);
  }

  uv_fs_req_cleanup(&scan_req);

  uv_fs_t rmdir_req;
  int rmdir_result = uv_fs_rmdir(0, &rmdir_req, path, 0);
  uv_fs_req_cleanup(&rmdir_req);

  return rmdir_result == 0 || (rmdir_result == UV_ENOENT && force) ? CCJS_OK : ccjs_fs_status_from_uv(rmdir_result);
}

static ccjs_status ccjs_fs_libuv_rm(void* user, const char* path, size_t path_len, bool recursive, bool force) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_fs_libuv_rm_path(path_copy, recursive, force);
  free(path_copy);

  return status;
}

static ccjs_status
ccjs_fs_libuv_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len) {
  (void)user;

  if ((old_path == 0 && old_path_len != 0) || (new_path == 0 && new_path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  char* old_copy = 0;
  char* new_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(old_path, old_path_len, &old_copy);

  if (status == CCJS_OK) {
    status = ccjs_fs_copy_host_bytes(new_path, new_path_len, &new_copy);
  }

  if (status != CCJS_OK) {
    free(old_copy);
    free(new_copy);
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_rename(0, &req, old_copy, new_copy, 0);
  uv_fs_req_cleanup(&req);
  free(old_copy);
  free(new_copy);

  return ccjs_fs_status_from_uv(result);
}

static ccjs_status
ccjs_fs_libuv_write_file_with_flags(const char* path, size_t path_len, const char* bytes, size_t byte_len, int flags) {
  if ((path == 0 && path_len != 0) || (bytes == 0 && byte_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (byte_len > (size_t)INT64_MAX) {
    return CCJS_ERR_OOM;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  uv_fs_t open_req;
  int open_result = uv_fs_open(0, &open_req, path_copy, flags, 0666, 0);
  uv_fs_req_cleanup(&open_req);
  free(path_copy);

  if (open_result < 0) {
    return ccjs_fs_status_from_uv(open_result);
  }

  uv_file file = (uv_file)open_result;
  size_t offset = 0;

  while (offset < byte_len) {
    size_t remaining = byte_len - offset;
    unsigned int chunk_len = remaining > (size_t)UINT_MAX ? UINT_MAX : (unsigned int)remaining;
    uv_buf_t buffer_slice = uv_buf_init((char*)bytes + offset, chunk_len);
    uv_fs_t write_req;
    int64_t write_offset = (flags & UV_FS_O_APPEND) != 0 ? -1 : (int64_t)offset;
    int write_result = uv_fs_write(0, &write_req, file, &buffer_slice, 1, write_offset, 0);
    uv_fs_req_cleanup(&write_req);

    if (write_result < 0) {
      return ccjs_fs_libuv_close_sync(file, ccjs_fs_status_from_uv(write_result));
    }

    if (write_result == 0) {
      return ccjs_fs_libuv_close_sync(file, CCJS_ERR_FIELD);
    }

    offset += (size_t)write_result;
  }

  return ccjs_fs_libuv_close_sync(file, CCJS_OK);
}

static ccjs_status ccjs_fs_libuv_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return ccjs_fs_libuv_write_file_with_flags(path, path_len, bytes, byte_len, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_APPEND);
}

static ccjs_status ccjs_fs_libuv_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
) {
  (void)user;

  if ((src_path == 0 && src_path_len != 0) || (dest_path == 0 && dest_path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  char* src_copy = 0;
  char* dest_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(src_path, src_path_len, &src_copy);

  if (status == CCJS_OK) {
    status = ccjs_fs_copy_host_bytes(dest_path, dest_path_len, &dest_copy);
  }

  if (status != CCJS_OK) {
    free(src_copy);
    free(dest_copy);
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_copyfile(0, &req, src_copy, dest_copy, 0, 0);
  uv_fs_req_cleanup(&req);
  free(src_copy);
  free(dest_copy);

  return ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len) {
  (void)user;

  if ((target == 0 && target_len != 0) || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  char* target_copy = 0;
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(target, target_len, &target_copy);

  if (status == CCJS_OK) {
    status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);
  }

  if (status != CCJS_OK) {
    free(target_copy);
    free(path_copy);
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_symlink(0, &req, target_copy, path_copy, 0, 0);
  uv_fs_req_cleanup(&req);
  free(target_copy);
  free(path_copy);

  return ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return ccjs_fs_libuv_write_file_with_flags(path, path_len, bytes, byte_len, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_TRUNC);
}

static ccjs_status ccjs_fs_libuv_queue_request(
  ccjs_loop* loop,
  ccjs_fs_request_kind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  ccjs_promise** out
) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (
    loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || (path == 0 && path_len != 0) ||
    (path2 == 0 && path2_len != 0) ||
    (bytes == 0 && byte_len != 0)
  ) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise* promise = 0;
  ccjs_status status = ccjs_promise_new(loop, &promise);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_fs_libuv_request* request =
    loop->allocator->alloc(loop->allocator->user, sizeof(ccjs_fs_libuv_request), _Alignof(ccjs_fs_libuv_request));

  if (request == 0) {
    ccjs_promise_release(promise);
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_fs_libuv_request));
  request->loop = loop;
  request->promise = promise;
  request->kind = kind;
  request->stage = CCJS_FS_LIBUV_STAGE_OPEN;
  request->file = 0;
  request->path_len = path_len;
  request->path2_len = path2_len;
  request->byte_len = byte_len;
  request->mode = mode;
  request->recursive = recursive;
  request->force = force;
  request->close_status = CCJS_OK;
  ccjs_promise_retain(promise);

  status = ccjs_fs_copy_bytes(loop->allocator, path, path_len, &request->path);

  if (status == CCJS_OK && (kind == CCJS_FS_REQUEST_COPY_FILE || kind == CCJS_FS_REQUEST_RENAME || kind == CCJS_FS_REQUEST_SYMLINK)) {
    status = ccjs_fs_copy_bytes(loop->allocator, path2, path2_len, &request->path2);
  }

  if (status == CCJS_OK && (kind == CCJS_FS_REQUEST_APPEND_FILE || kind == CCJS_FS_REQUEST_WRITE_FILE)) {
    status = ccjs_fs_copy_bytes(loop->allocator, bytes, byte_len, &request->bytes);
  }

  if (status == CCJS_OK) {
    status = ccjs_libuv_loop_retain_request(loop);
  }

  if (status == CCJS_OK) {
    status = ccjs_fs_libuv_start_request(request);
  }

  if (status != CCJS_OK) {
    if (ccjs_libuv_loop_handle(loop) != 0) {
      ccjs_libuv_loop_release_request(loop);
    }
    ccjs_fs_libuv_request_finalizer(request);
    ccjs_promise_release(promise);
    return status;
  }

  *out = promise;

  return CCJS_OK;
}

static ccjs_status ccjs_fs_libuv_start_request(ccjs_fs_libuv_request* request) {
  if (request == 0) {
    return CCJS_ERR_TYPE;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_DIR || request->kind == CCJS_FS_REQUEST_READ_DIR_DIRENTS) {
    request->stage = CCJS_FS_LIBUV_STAGE_SCANDIR;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_scandir(uv_loop, &request->req, request->path, 0, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_STAT || request->kind == CCJS_FS_REQUEST_LSTAT) {
    request->stage = request->kind == CCJS_FS_REQUEST_STAT ? CCJS_FS_LIBUV_STAGE_STAT : CCJS_FS_LIBUV_STAGE_LSTAT;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = request->kind == CCJS_FS_REQUEST_STAT
                   ? uv_fs_stat(uv_loop, &request->req, request->path, ccjs_fs_libuv_cb)
                   : uv_fs_lstat(uv_loop, &request->req, request->path, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_REALPATH || request->kind == CCJS_FS_REQUEST_READLINK) {
    request->stage = request->kind == CCJS_FS_REQUEST_REALPATH ? CCJS_FS_LIBUV_STAGE_REALPATH : CCJS_FS_LIBUV_STAGE_READLINK;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = request->kind == CCJS_FS_REQUEST_REALPATH
                   ? uv_fs_realpath(uv_loop, &request->req, request->path, ccjs_fs_libuv_cb)
                   : uv_fs_readlink(uv_loop, &request->req, request->path, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_ACCESS) {
    request->stage = CCJS_FS_LIBUV_STAGE_ACCESS;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_access(uv_loop, &request->req, request->path, request->mode, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_MKDIR) {
    request->stage = CCJS_FS_LIBUV_STAGE_MKDIR;

    if (request->recursive) {
      ccjs_status status = ccjs_fs_libuv_mkdir(0, request->path, request->path_len, true);

      return ccjs_fs_libuv_settle_value(request, status, ccjs_undefined_value());
    }

    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_mkdir(uv_loop, &request->req, request->path, 0777, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_UNLINK) {
    request->stage = CCJS_FS_LIBUV_STAGE_UNLINK;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_unlink(uv_loop, &request->req, request->path, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_RM) {
    request->stage = CCJS_FS_LIBUV_STAGE_RM;

    if (request->recursive) {
      ccjs_status status = ccjs_fs_libuv_rm(0, request->path, request->path_len, true, request->force);

      return ccjs_fs_libuv_settle_value(request, status, ccjs_undefined_value());
    }

    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_unlink(uv_loop, &request->req, request->path, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_RENAME) {
    request->stage = CCJS_FS_LIBUV_STAGE_RENAME;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_rename(uv_loop, &request->req, request->path, request->path2, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_COPY_FILE) {
    request->stage = CCJS_FS_LIBUV_STAGE_COPY_FILE;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_copyfile(uv_loop, &request->req, request->path, request->path2, 0, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_SYMLINK) {
    request->stage = CCJS_FS_LIBUV_STAGE_SYMLINK;
    request->req.data = request;
    uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return CCJS_ERR_TYPE;
    }

    int result = uv_fs_symlink(uv_loop, &request->req, request->path, request->path2, 0, ccjs_fs_libuv_cb);

    return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
  }

  if (request->kind == CCJS_FS_REQUEST_APPEND_FILE) {
    return ccjs_fs_libuv_start_open(request, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_APPEND, 0666);
  }

  if (request->kind == CCJS_FS_REQUEST_WRITE_FILE) {
    return ccjs_fs_libuv_start_open(request, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_TRUNC, 0666);
  }

  return ccjs_fs_libuv_start_open(request, UV_FS_O_RDONLY, 0);
}

static ccjs_status ccjs_fs_libuv_start_open(ccjs_fs_libuv_request* request, int flags, int mode) {
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0) {
    return CCJS_ERR_TYPE;
  }

  request->stage = CCJS_FS_LIBUV_STAGE_OPEN;
  request->req.data = request;
  int result = uv_fs_open(uv_loop, &request->req, request->path, flags, mode, ccjs_fs_libuv_cb);

  return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_start_fstat(ccjs_fs_libuv_request* request) {
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0) {
    return CCJS_ERR_TYPE;
  }

  request->stage = CCJS_FS_LIBUV_STAGE_FSTAT;
  request->req.data = request;
  int result = uv_fs_fstat(uv_loop, &request->req, request->file, ccjs_fs_libuv_cb);

  return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_start_read(ccjs_fs_libuv_request* request) {
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0 || request->data == 0 || request->data_cap == 0) {
    return CCJS_ERR_TYPE;
  }

  if (request->data_cap > (size_t)UINT_MAX) {
    return CCJS_ERR_OOM;
  }

  uv_buf_t buffer = uv_buf_init(request->data, (unsigned int)request->data_cap);
  request->stage = CCJS_FS_LIBUV_STAGE_READ;
  request->req.data = request;
  int result = uv_fs_read(uv_loop, &request->req, request->file, &buffer, 1, 0, ccjs_fs_libuv_cb);

  return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_start_write(ccjs_fs_libuv_request* request) {
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0 || (request->bytes == 0 && request->byte_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  size_t remaining = request->byte_len - request->byte_offset;

  if (remaining == 0) {
    return ccjs_fs_libuv_start_close(request, CCJS_OK);
  }

  unsigned int chunk_len = remaining > (size_t)UINT_MAX ? UINT_MAX : (unsigned int)remaining;
  uv_buf_t buffer = uv_buf_init(request->bytes + request->byte_offset, chunk_len);
  request->stage = CCJS_FS_LIBUV_STAGE_WRITE;
  request->req.data = request;
  int64_t offset = request->kind == CCJS_FS_REQUEST_APPEND_FILE ? -1 : (int64_t)request->byte_offset;
  int result = uv_fs_write(uv_loop, &request->req, request->file, &buffer, 1, offset, ccjs_fs_libuv_cb);

  return result == 0 ? CCJS_OK : ccjs_fs_status_from_uv(result);
}

static ccjs_status ccjs_fs_libuv_start_close(ccjs_fs_libuv_request* request, ccjs_status close_status) {
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0) {
    return CCJS_ERR_TYPE;
  }

  request->close_status = close_status;

  if (!request->file_open) {
    return ccjs_fs_libuv_settle(request, close_status);
  }

  request->stage = CCJS_FS_LIBUV_STAGE_CLOSE;
  request->req.data = request;
  int result = uv_fs_close(uv_loop, &request->req, request->file, ccjs_fs_libuv_cb);

  if (result != 0) {
    request->file_open = 0;
    return ccjs_fs_libuv_settle(request, close_status == CCJS_OK ? ccjs_fs_status_from_uv(result) : close_status);
  }

  return CCJS_OK;
}

static ccjs_status ccjs_fs_libuv_settle(ccjs_fs_libuv_request* request, ccjs_status status) {
  if (request == 0) {
    return CCJS_ERR_TYPE;
  }

  if (status != CCJS_OK) {
    return ccjs_fs_libuv_settle_value(request, status, ccjs_undefined_value());
  }

  ccjs_value result = ccjs_undefined_value();

  if (request->kind == CCJS_FS_REQUEST_READ_FILE) {
    status = ccjs_string_from_literal(
      request->loop->allocator, request->data == 0 ? "" : request->data, request->data_len, &result
    );
  } else if (request->kind == CCJS_FS_REQUEST_READ_FILE_BYTES) {
    status = ccjs_bytes_from_data(request->loop->allocator, (const uint8_t*)request->data, request->data_len, &result);
  }

  return ccjs_fs_libuv_settle_value(request, status, result);
}

static ccjs_status ccjs_fs_libuv_settle_value(ccjs_fs_libuv_request* request, ccjs_status status, ccjs_value value) {
  if (request == 0 || request->loop == 0 || request->promise == 0) {
    ccjs_release(value);
    return CCJS_ERR_TYPE;
  }

  ccjs_status settle_status =
    status == CCJS_OK ? ccjs_promise_resolve(request->promise, value) : ccjs_fs_reject_status(request->loop, request->promise, status);

  ccjs_release(value);
  ccjs_libuv_loop_release_request(request->loop);
  ccjs_fs_libuv_request_finalizer(request);

  return settle_status;
}

static ccjs_status ccjs_fs_libuv_settle_after_close(ccjs_fs_libuv_request* request, ccjs_status status) {
  if (request == 0) {
    return CCJS_ERR_TYPE;
  }

  request->file_open = 0;

  if (request->close_status != CCJS_OK) {
    status = request->close_status;
  }

  return ccjs_fs_libuv_settle(request, status);
}

static void ccjs_fs_libuv_cb(uv_fs_t* req) {
  if (req == 0 || req->data == 0) {
    return;
  }

  ccjs_fs_libuv_request* request = (ccjs_fs_libuv_request*)req->data;
  ccjs_loop* loop = request->loop;
  ssize_t result = uv_fs_get_result(req);
  ccjs_status status = ccjs_fs_status_from_uv(result);

  if (request->stage == CCJS_FS_LIBUV_STAGE_SCANDIR) {
    ccjs_value entries = ccjs_undefined_value();

    if (status == CCJS_OK) {
      status = ccjs_fs_libuv_read_dir_entries(
        req, request->loop->allocator, request->kind == CCJS_FS_REQUEST_READ_DIR_DIRENTS, &entries
      );
    }

    uv_fs_req_cleanup(req);
    status = ccjs_fs_libuv_settle_value(request, status, entries);

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_STAT || request->stage == CCJS_FS_LIBUV_STAGE_LSTAT) {
    ccjs_value stats = ccjs_undefined_value();

    if (status == CCJS_OK) {
      status = ccjs_fs_stats_from_uv(request->loop->allocator, uv_fs_get_statbuf(req), &stats);
    }

    uv_fs_req_cleanup(req);
    status = ccjs_fs_libuv_settle_value(request, status, stats);

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_REALPATH || request->stage == CCJS_FS_LIBUV_STAGE_READLINK) {
    ccjs_value text = ccjs_undefined_value();

    if (status == CCJS_OK) {
      const char* result_text = (const char*)req->ptr;
      status = ccjs_string_from_literal(
        request->loop->allocator, result_text == 0 ? "" : result_text, result_text == 0 ? 0 : strlen(result_text), &text
      );
    }

    uv_fs_req_cleanup(req);
    status = ccjs_fs_libuv_settle_value(request, status, text);

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_ACCESS) {
    uv_fs_req_cleanup(req);
    status = ccjs_fs_libuv_settle_value(request, status, ccjs_undefined_value());

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (
    request->stage == CCJS_FS_LIBUV_STAGE_MKDIR || request->stage == CCJS_FS_LIBUV_STAGE_UNLINK ||
    request->stage == CCJS_FS_LIBUV_STAGE_RM || request->stage == CCJS_FS_LIBUV_STAGE_COPY_FILE ||
    request->stage == CCJS_FS_LIBUV_STAGE_SYMLINK || request->stage == CCJS_FS_LIBUV_STAGE_RENAME
  ) {
    uv_fs_req_cleanup(req);

    if (request->stage == CCJS_FS_LIBUV_STAGE_RM && result == UV_ENOENT && request->force) {
      status = CCJS_OK;
    }

    status = ccjs_fs_libuv_settle_value(request, status, ccjs_undefined_value());

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_OPEN) {
    if (status != CCJS_OK) {
      uv_fs_req_cleanup(req);
      status = ccjs_fs_libuv_settle(request, status);
    } else {
      request->file = (uv_file)result;
      request->file_open = 1;
      uv_fs_req_cleanup(req);
      status = request->kind == CCJS_FS_REQUEST_WRITE_FILE || request->kind == CCJS_FS_REQUEST_APPEND_FILE
                 ? ccjs_fs_libuv_start_write(request)
                 : ccjs_fs_libuv_start_fstat(request);

      if (status != CCJS_OK) {
        status = ccjs_fs_libuv_start_close(request, status);
      }
    }

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_FSTAT) {
    if (status == CCJS_OK) {
      uint64_t file_size = uv_fs_get_statbuf(req)->st_size;

      if (file_size > (uint64_t)INT64_MAX || file_size > (uint64_t)(SIZE_MAX - 1) || file_size > (uint64_t)UINT_MAX) {
        status = CCJS_ERR_OOM;
      } else {
        request->data_cap = (size_t)file_size;

        if (request->data_cap != 0) {
          request->data =
            request->loop->allocator->alloc(request->loop->allocator->user, request->data_cap + 1, _Alignof(char));

          if (request->data == 0) {
            status = CCJS_ERR_OOM;
          }
        }
      }
    }

    uv_fs_req_cleanup(req);

    if (status == CCJS_OK && request->data_cap != 0) {
      status = ccjs_fs_libuv_start_read(request);

      if (status != CCJS_OK) {
        status = ccjs_fs_libuv_start_close(request, status);
      }
    } else {
      status = ccjs_fs_libuv_start_close(request, status);
    }

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_READ) {
    if (status == CCJS_OK) {
      request->data_len = (size_t)result;

      if (request->data != 0) {
        request->data[request->data_len] = '\0';
      }
    }

    uv_fs_req_cleanup(req);
    status = ccjs_fs_libuv_start_close(request, status);

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == CCJS_FS_LIBUV_STAGE_WRITE) {
    if (status == CCJS_OK) {
      if (result == 0 && request->byte_offset < request->byte_len) {
        status = CCJS_ERR_FIELD;
      } else {
        request->byte_offset += (size_t)result;
      }
    }

    uv_fs_req_cleanup(req);

    if (status == CCJS_OK && request->byte_offset < request->byte_len) {
      status = ccjs_fs_libuv_start_write(request);

      if (status != CCJS_OK) {
        status = ccjs_fs_libuv_start_close(request, status);
      }
    } else {
      status = ccjs_fs_libuv_start_close(request, status);
    }

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(loop, status);
    }

    return;
  }

  uv_fs_req_cleanup(req);
  status = ccjs_fs_libuv_settle_after_close(request, status);

  if (status != CCJS_OK) {
    ccjs_libuv_loop_report_status(loop, status);
  }
}

static void ccjs_fs_libuv_request_finalizer(ccjs_fs_libuv_request* request) {
  if (request == 0 || request->loop == 0 || request->loop->allocator == 0 || request->loop->allocator->free == 0) {
    return;
  }

  ccjs_allocator* allocator = request->loop->allocator;

  if (request->path != 0) {
    allocator->free(allocator->user, request->path, request->path_len + 1, _Alignof(char));
  }

  if (request->path2 != 0) {
    allocator->free(allocator->user, request->path2, request->path2_len + 1, _Alignof(char));
  }

  if (request->bytes != 0) {
    allocator->free(allocator->user, request->bytes, request->byte_len + 1, _Alignof(char));
  }

  if (request->data != 0) {
    allocator->free(allocator->user, request->data, request->data_cap + 1, _Alignof(char));
  }

  ccjs_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(ccjs_fs_libuv_request), _Alignof(ccjs_fs_libuv_request));
}
#endif

#ifndef CCJS_FS_DISABLE_HOST
static ccjs_status ccjs_fs_default_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len) {
  if (out_bytes == 0 || out_len == 0) {
    return CCJS_ERR_TYPE;
  }

  *out_bytes = 0;
  *out_len = 0;

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  FILE* file = fopen(path_copy, "rb");
  free(path_copy);

  if (file == 0) {
    return CCJS_ERR_FIELD;
  }

  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  long length = ftell(file);

  if (length < 0) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  if (fseek(file, 0, SEEK_SET) != 0) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  size_t byte_len = (size_t)length;
  char* buffer = 0;

  if (byte_len != 0) {
    buffer = malloc(byte_len);

    if (buffer == 0) {
      fclose(file);
      return CCJS_ERR_OOM;
    }

    if (fread(buffer, 1, byte_len, file) != byte_len) {
      free(buffer);
      fclose(file);
      return CCJS_ERR_FIELD;
    }
  }

  fclose(file);
  *out_bytes = buffer;
  *out_len = byte_len;

  return CCJS_OK;
}

static ccjs_status
ccjs_fs_default_read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  ccjs_status status = ccjs_fs_default_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, buffer == 0 ? "" : buffer, byte_len, out);
  }

  free(buffer);

  return status;
}

static ccjs_status
ccjs_fs_default_read_file_bytes(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  ccjs_status status = ccjs_fs_default_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == CCJS_OK) {
    status = ccjs_bytes_from_data(allocator, (const uint8_t*)buffer, byte_len, out);
  }

  free(buffer);

  return status;
}

static ccjs_status
ccjs_fs_default_read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return CCJS_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  DIR* dir = opendir(path_copy);
  free(path_copy);

  if (dir == 0) {
    return CCJS_ERR_FIELD;
  }

  ccjs_value entries = ccjs_undefined_value();
  status = ccjs_array_new(allocator, 0, &entries);

  if (status != CCJS_OK) {
    closedir(dir);
    return status;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      ccjs_value value = ccjs_undefined_value();
      size_t name_len = strlen(name);
      status = ccjs_string_from_literal(allocator, name, name_len, &value);

      if (status == CCJS_OK) {
        status = ccjs_array_push(entries, value);
      }

      ccjs_release(value);

      if (status != CCJS_OK) {
        closedir(dir);
        ccjs_release(entries);
        return status;
      }
    }

    entry = readdir(dir);
  }

  if (closedir(dir) != 0) {
    ccjs_release(entries);
    return CCJS_ERR_FIELD;
  }

  *out = entries;

  return CCJS_OK;
#endif
}

static ccjs_status ccjs_fs_default_dirent_type(const char* dir_path, const char* name, bool* is_file, bool* is_directory) {
  if (dir_path == 0 || name == 0 || is_file == 0 || is_directory == 0) {
    return CCJS_ERR_TYPE;
  }

  *is_file = false;
  *is_directory = false;

  size_t dir_len = strlen(dir_path);
  size_t name_len = strlen(name);
  char* child = malloc(dir_len + 1 + name_len + 1);

  if (child == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(child, dir_path, dir_len);
  child[dir_len] = '/';
  memcpy(child + dir_len + 1, name, name_len + 1);

  struct stat statbuf;
  int stat_result = stat(child, &statbuf);
  free(child);

  if (stat_result != 0) {
    return CCJS_ERR_FIELD;
  }

  *is_file = S_ISREG(statbuf.st_mode);
  *is_directory = S_ISDIR(statbuf.st_mode);

  return CCJS_OK;
}

static ccjs_status
ccjs_fs_default_read_dir_dirents(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return CCJS_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  DIR* dir = opendir(path_copy);

  if (dir == 0) {
    free(path_copy);
    return CCJS_ERR_FIELD;
  }

  ccjs_value entries = ccjs_undefined_value();
  status = ccjs_array_new(allocator, 0, &entries);

  if (status != CCJS_OK) {
    free(path_copy);
    closedir(dir);
    return status;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      bool is_file = false;
      bool is_directory = false;
      status = ccjs_fs_default_dirent_type(path_copy, name, &is_file, &is_directory);

      ccjs_value value = ccjs_undefined_value();
      size_t name_len = strlen(name);

      if (status == CCJS_OK) {
        status = ccjs_fs_dirent_new(allocator, name, name_len, is_file, is_directory, &value);
      }

      if (status == CCJS_OK) {
        status = ccjs_array_push(entries, value);
      }

      ccjs_release(value);

      if (status != CCJS_OK) {
        free(path_copy);
        closedir(dir);
        ccjs_release(entries);
        return status;
      }
    }

    entry = readdir(dir);
  }

  free(path_copy);

  if (closedir(dir) != 0) {
    ccjs_release(entries);
    return CCJS_ERR_FIELD;
  }

  *out = entries;

  return CCJS_OK;
#endif
}

static double ccjs_fs_default_mtime_ms(const struct stat* stat) {
  if (stat == 0) {
    return 0;
  }

#ifdef _WIN32
  return (double)stat->st_mtime * 1000.0;
#elif defined(__APPLE__) || defined(__MACH__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
  return ((double)stat->st_mtimespec.tv_sec * 1000.0) + ((double)stat->st_mtimespec.tv_nsec / 1000000.0);
#else
  return ((double)stat->st_mtim.tv_sec * 1000.0) + ((double)stat->st_mtim.tv_nsec / 1000000.0);
#endif
}

static ccjs_status ccjs_fs_default_stats_from_stat(ccjs_allocator* allocator, const struct stat* stat, ccjs_value* out) {
  if (stat == 0) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_fs_stats_new(
    allocator,
    (double)stat->st_size,
    (double)stat->st_mode,
    ccjs_fs_default_mtime_ms(stat),
    S_ISREG(stat->st_mode),
    S_ISDIR(stat->st_mode),
    out
  );
}

static ccjs_status ccjs_fs_default_stat_like(
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out,
  bool follow_symlink
) {
  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  struct stat statbuf;
#ifdef _WIN32
  (void)follow_symlink;
  int stat_result = stat(path_copy, &statbuf);
#else
  int stat_result = follow_symlink ? stat(path_copy, &statbuf) : lstat(path_copy, &statbuf);
#endif
  free(path_copy);

  if (stat_result != 0) {
    return CCJS_ERR_FIELD;
  }

  return ccjs_fs_default_stats_from_stat(allocator, &statbuf, out);
}

static ccjs_status ccjs_fs_default_stat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  return ccjs_fs_default_stat_like(allocator, path, path_len, out, true);
}

static ccjs_status ccjs_fs_default_lstat(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  return ccjs_fs_default_stat_like(allocator, path, path_len, out, false);
}

static ccjs_status ccjs_fs_default_realpath(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return CCJS_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  char* resolved = realpath(path_copy, 0);
  free(path_copy);

  if (resolved == 0) {
    return CCJS_ERR_FIELD;
  }

  status = ccjs_string_from_literal(allocator, resolved, strlen(resolved), out);
  free(resolved);

  return status;
#endif
}

static ccjs_status ccjs_fs_default_readlink(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return CCJS_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  size_t cap = 256;
  char* buffer = 0;

  for (;;) {
    char* next = realloc(buffer, cap + 1);

    if (next == 0) {
      free(buffer);
      free(path_copy);
      return CCJS_ERR_OOM;
    }

    buffer = next;
    ssize_t len = readlink(path_copy, buffer, cap);

    if (len < 0) {
      free(buffer);
      free(path_copy);
      return CCJS_ERR_FIELD;
    }

    if ((size_t)len < cap) {
      buffer[len] = '\0';
      status = ccjs_string_from_literal(allocator, buffer, (size_t)len, out);
      free(buffer);
      free(path_copy);
      return status;
    }

    cap *= 2;
  }
#endif
}

static ccjs_status ccjs_fs_default_access(void* user, const char* path, size_t path_len, int mode) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

#ifdef _WIN32
  int access_result = _access(path_copy, mode);
#else
  int access_result = access(path_copy, mode);
#endif
  free(path_copy);

  return access_result == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

static ccjs_status ccjs_fs_default_mkdir_one(const char* path) {
#ifdef _WIN32
  int result = _mkdir(path);
#else
  int result = mkdir(path, 0777);
#endif

  return result == 0 || errno == EEXIST ? CCJS_OK : CCJS_ERR_FIELD;
}

static ccjs_status ccjs_fs_default_mkdir_recursive(char* path) {
  if (path == 0 || path[0] == '\0') {
    return CCJS_ERR_TYPE;
  }

  for (char* cursor = path + 1; *cursor != '\0'; cursor += 1) {
    if (*cursor != '/' && *cursor != '\\') {
      continue;
    }

    char saved = *cursor;
    *cursor = '\0';

    if (path[0] != '\0') {
      ccjs_status status = ccjs_fs_default_mkdir_one(path);

      if (status != CCJS_OK) {
        *cursor = saved;
        return status;
      }
    }

    *cursor = saved;
  }

  return ccjs_fs_default_mkdir_one(path);
}

static ccjs_status ccjs_fs_default_mkdir(void* user, const char* path, size_t path_len, bool recursive) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  errno = 0;
  status = recursive ? ccjs_fs_default_mkdir_recursive(path_copy) : ccjs_fs_default_mkdir_one(path_copy);
  free(path_copy);

  return status;
}

static ccjs_status ccjs_fs_default_unlink(void* user, const char* path, size_t path_len) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

#ifdef _WIN32
  int result = _unlink(path_copy);
#else
  int result = unlink(path_copy);
#endif
  free(path_copy);

  return result == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

static ccjs_status ccjs_fs_default_rm_path(char* path, bool recursive, bool force) {
#ifdef _WIN32
  int unlink_result = _unlink(path);
#else
  int unlink_result = unlink(path);
#endif

  if (unlink_result == 0) {
    return CCJS_OK;
  }

  if (errno == ENOENT && force) {
    return CCJS_OK;
  }

  if (!recursive) {
    return CCJS_ERR_FIELD;
  }

#ifdef _WIN32
  return CCJS_ERR_UNSUPPORTED;
#else
  DIR* dir = opendir(path);

  if (dir == 0) {
    return errno == ENOENT && force ? CCJS_OK : CCJS_ERR_FIELD;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      size_t path_len = strlen(path);
      size_t name_len = strlen(name);
      char* child = malloc(path_len + 1 + name_len + 1);

      if (child == 0) {
        closedir(dir);
        return CCJS_ERR_OOM;
      }

      memcpy(child, path, path_len);
      child[path_len] = '/';
      memcpy(child + path_len + 1, name, name_len + 1);
      ccjs_status status = ccjs_fs_default_rm_path(child, true, force);
      free(child);

      if (status != CCJS_OK) {
        closedir(dir);
        return status;
      }
    }

    entry = readdir(dir);
  }

  if (closedir(dir) != 0) {
    return CCJS_ERR_FIELD;
  }

  return rmdir(path) == 0 || (errno == ENOENT && force) ? CCJS_OK : CCJS_ERR_FIELD;
#endif
}

static ccjs_status ccjs_fs_default_rm(void* user, const char* path, size_t path_len, bool recursive, bool force) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  errno = 0;
  status = ccjs_fs_default_rm_path(path_copy, recursive, force);
  free(path_copy);

  return status;
}

static ccjs_status
ccjs_fs_default_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len) {
  (void)user;

  if ((old_path == 0 && old_path_len != 0) || (new_path == 0 && new_path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  char* old_copy = 0;
  char* new_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(old_path, old_path_len, &old_copy);

  if (status == CCJS_OK) {
    status = ccjs_fs_copy_host_bytes(new_path, new_path_len, &new_copy);
  }

  if (status != CCJS_OK) {
    free(old_copy);
    free(new_copy);
    return status;
  }

  int result = rename(old_copy, new_copy);
  free(old_copy);
  free(new_copy);

  return result == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

static ccjs_status ccjs_fs_default_write_file_with_mode(
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len,
  const char* mode
) {
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  FILE* file = fopen(path_copy, mode);
  free(path_copy);

  if (file == 0) {
    return CCJS_ERR_FIELD;
  }

  if (byte_len != 0 && fwrite(bytes, 1, byte_len, file) != byte_len) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  if (fclose(file) != 0) {
    return CCJS_ERR_FIELD;
  }

  return CCJS_OK;
}

static ccjs_status ccjs_fs_default_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return ccjs_fs_default_write_file_with_mode(path, path_len, bytes, byte_len, "ab");
}

static ccjs_status ccjs_fs_default_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
) {
  (void)user;

  char* buffer = 0;
  size_t byte_len = 0;
  ccjs_status status = ccjs_fs_default_read_file_data(src_path, src_path_len, &buffer, &byte_len);

  if (status == CCJS_OK) {
    status = ccjs_fs_default_write_file_with_mode(dest_path, dest_path_len, buffer, byte_len, "wb");
  }

  free(buffer);

  return status;
}

static ccjs_status ccjs_fs_default_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len) {
  (void)user;

  if ((target == 0 && target_len != 0) || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

#ifdef _WIN32
  (void)target;
  (void)target_len;
  (void)path;
  (void)path_len;
  return CCJS_ERR_UNSUPPORTED;
#else
  char* target_copy = 0;
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(target, target_len, &target_copy);

  if (status == CCJS_OK) {
    status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);
  }

  if (status != CCJS_OK) {
    free(target_copy);
    free(path_copy);
    return status;
  }

  int result = symlink(target_copy, path_copy);
  free(target_copy);
  free(path_copy);

  return result == 0 ? CCJS_OK : CCJS_ERR_FIELD;
#endif
}

static ccjs_status ccjs_fs_default_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return ccjs_fs_default_write_file_with_mode(path, path_len, bytes, byte_len, "wb");
}
#endif

static ccjs_status ccjs_fs_queue_request(
  ccjs_loop* loop,
  ccjs_fs_request_kind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  ccjs_promise** out
) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (
    loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || (path == 0 && path_len != 0) ||
    (path2 == 0 && path2_len != 0) ||
    (bytes == 0 && byte_len != 0)
  ) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise* promise = 0;
  ccjs_status status = ccjs_promise_new(loop, &promise);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_fs_request* request = loop->allocator->alloc(loop->allocator->user, sizeof(ccjs_fs_request), _Alignof(ccjs_fs_request));

  if (request == 0) {
    ccjs_promise_release(promise);
    return CCJS_ERR_OOM;
  }

  request->loop = loop;
  request->promise = promise;
  request->kind = kind;
  request->path = 0;
  request->path_len = path_len;
  request->path2 = 0;
  request->path2_len = path2_len;
  request->bytes = 0;
  request->byte_len = byte_len;
  request->mode = mode;
  request->recursive = recursive;
  request->force = force;
  ccjs_promise_retain(promise);

  status = ccjs_fs_copy_bytes(loop->allocator, path, path_len, &request->path);

  if (status == CCJS_OK && (kind == CCJS_FS_REQUEST_COPY_FILE || kind == CCJS_FS_REQUEST_RENAME || kind == CCJS_FS_REQUEST_SYMLINK)) {
    status = ccjs_fs_copy_bytes(loop->allocator, path2, path2_len, &request->path2);
  }

  if (status == CCJS_OK && (kind == CCJS_FS_REQUEST_APPEND_FILE || kind == CCJS_FS_REQUEST_WRITE_FILE)) {
    status = ccjs_fs_copy_bytes(loop->allocator, bytes, byte_len, &request->bytes);
  }

  if (status == CCJS_OK) {
    status = ccjs_loop_queue_immediate(loop, ccjs_fs_run_request, request, ccjs_fs_request_finalizer, 0);
  }

  if (status != CCJS_OK) {
    ccjs_fs_request_finalizer(request);
    ccjs_promise_release(promise);
    return status;
  }

  *out = promise;

  return CCJS_OK;
}

static ccjs_status ccjs_fs_run_request(void* context) {
  ccjs_fs_request* request = (ccjs_fs_request*)context;

  if (request == 0 || request->loop == 0 || request->promise == 0) {
    return CCJS_ERR_TYPE;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_FILE) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = ccjs_fs_read_file_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_FILE_BYTES) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = ccjs_fs_read_file_bytes_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_DIR) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = ccjs_fs_read_dir_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_DIR_DIRENTS) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = ccjs_fs_read_dir_dirents_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_STAT || request->kind == CCJS_FS_REQUEST_LSTAT) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = request->kind == CCJS_FS_REQUEST_STAT
                           ? ccjs_fs_stat_sync(request->loop->allocator, request->path, request->path_len, &result)
                           : ccjs_fs_lstat_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_REALPATH || request->kind == CCJS_FS_REQUEST_READLINK) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = request->kind == CCJS_FS_REQUEST_REALPATH
                           ? ccjs_fs_realpath_sync(request->loop->allocator, request->path, request->path_len, &result)
                           : ccjs_fs_readlink_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_ACCESS) {
    ccjs_status status = ccjs_fs_access_sync(request->path, request->path_len, request->mode);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_MKDIR) {
    ccjs_status status = ccjs_fs_mkdir_sync(request->path, request->path_len, request->recursive);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_UNLINK) {
    ccjs_status status = ccjs_fs_unlink_sync(request->path, request->path_len);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_RM) {
    ccjs_status status = ccjs_fs_rm_sync(request->path, request->path_len, request->recursive, request->force);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_RENAME) {
    ccjs_status status = ccjs_fs_rename_sync(request->path, request->path_len, request->path2, request->path2_len);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_APPEND_FILE) {
    ccjs_status status = ccjs_fs_append_file_sync(request->path, request->path_len, request->bytes, request->byte_len);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_COPY_FILE) {
    ccjs_status status = ccjs_fs_copy_file_sync(request->path, request->path_len, request->path2, request->path2_len);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  if (request->kind == CCJS_FS_REQUEST_SYMLINK) {
    ccjs_status status = ccjs_fs_symlink_sync(request->path, request->path_len, request->path2, request->path2_len);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->loop, request->promise, status);
    }

    return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
  }

  ccjs_status status = ccjs_fs_write_file_sync(request->path, request->path_len, request->bytes, request->byte_len);

  if (status != CCJS_OK) {
    return ccjs_fs_reject_status(request->loop, request->promise, status);
  }

  return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
}

static ccjs_status ccjs_fs_reject_status(ccjs_loop* loop, ccjs_promise* promise, ccjs_status status) {
  if (loop == 0 || promise == 0 || loop->allocator == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_value error = ccjs_undefined_value();
  ccjs_status error_status = ccjs_fs_error_from_status(loop->allocator, status, &error);

  if (error_status != CCJS_OK) {
    return ccjs_promise_reject(promise, ccjs_number_value((ccjs_number)status));
  }

  ccjs_status reject_status = ccjs_promise_reject(promise, error);
  ccjs_release(error);

  return reject_status == CCJS_OK ? CCJS_OK : reject_status;
}

static ccjs_status ccjs_fs_error_from_status(ccjs_allocator* allocator, ccjs_status status, ccjs_value* out) {
  static const ccjs_field_info fields[] = { { "name", CCJS_FIELD_READONLY },
                                            { "message", CCJS_FIELD_READONLY },
                                            { "code", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 3, fields };

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_value error = ccjs_undefined_value();
  ccjs_value name = ccjs_undefined_value();
  ccjs_value message = ccjs_undefined_value();
  ccjs_value code = ccjs_undefined_value();
  ccjs_status result = ccjs_object_new(allocator, &shape, &error);

  if (result == CCJS_OK) {
    result = ccjs_string_from_literal(allocator, "FsError", 7, &name);
  }

  const char* message_text = ccjs_fs_error_message(status);

  if (result == CCJS_OK) {
    result = ccjs_string_from_literal(allocator, message_text, strlen(message_text), &message);
  }

  const char* code_text = ccjs_fs_error_code(status);

  if (result == CCJS_OK) {
    result = ccjs_string_from_literal(allocator, code_text, strlen(code_text), &code);
  }

  if (result == CCJS_OK) {
    result = ccjs_object_init_known(error, 0, name);
  }

  if (result == CCJS_OK) {
    result = ccjs_object_init_known(error, 1, message);
  }

  if (result == CCJS_OK) {
    result = ccjs_object_init_known(error, 2, code);
  }

  ccjs_release(code);
  ccjs_release(message);
  ccjs_release(name);

  if (result != CCJS_OK) {
    ccjs_release(error);
    return result;
  }

  *out = error;

  return CCJS_OK;
}

static const char* ccjs_fs_error_code(ccjs_status status) {
  if (status == CCJS_ERR_UNSUPPORTED) {
    return "ERR_FS_UNSUPPORTED";
  }

  if (status == CCJS_ERR_TYPE) {
    return "ERR_FS_TYPE";
  }

  if (status == CCJS_ERR_OOM) {
    return "ERR_FS_OOM";
  }

  if (status == CCJS_ERR_READONLY) {
    return "ERR_FS_READONLY";
  }

  return "ERR_FS_OPERATION";
}

static const char* ccjs_fs_error_message(ccjs_status status) {
  if (status == CCJS_ERR_UNSUPPORTED) {
    return "filesystem adapter is unavailable";
  }

  if (status == CCJS_ERR_TYPE) {
    return "invalid filesystem argument";
  }

  if (status == CCJS_ERR_OOM) {
    return "out of memory during filesystem operation";
  }

  if (status == CCJS_ERR_READONLY) {
    return "filesystem target is readonly";
  }

  return "filesystem operation failed";
}

static void ccjs_fs_request_finalizer(void* context) {
  ccjs_fs_request* request = (ccjs_fs_request*)context;

  if (request == 0 || request->loop == 0 || request->loop->allocator == 0 || request->loop->allocator->free == 0) {
    return;
  }

  ccjs_allocator* allocator = request->loop->allocator;

  if (request->path != 0) {
    allocator->free(allocator->user, request->path, request->path_len + 1, _Alignof(char));
  }

  if (request->path2 != 0) {
    allocator->free(allocator->user, request->path2, request->path2_len + 1, _Alignof(char));
  }

  if (request->bytes != 0) {
    allocator->free(allocator->user, request->bytes, request->byte_len + 1, _Alignof(char));
  }

  ccjs_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(ccjs_fs_request), _Alignof(ccjs_fs_request));
}
