#ifndef INOX_PROCESS_H
#define INOX_PROCESS_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

void inox_process_init(int argc, char** argv);
void inox_process_init_with_entry(int argc, char** argv, const char* entry_path);
inox_status inox_process_arch(inox_allocator* allocator, inox_value* out);
inox_status inox_process_argv(inox_allocator* allocator, int index, inox_value* out);
int inox_process_argv_length(void);
inox_status inox_process_argv0(inox_allocator* allocator, inox_value* out);
inox_status inox_process_cwd(inox_allocator* allocator, inox_value* out);
inox_status inox_process_env(inox_allocator* allocator, const char* name, size_t name_len, inox_value* out);
inox_status inox_process_execPath(inox_allocator* allocator, inox_value* out);
int inox_process_get_exit_code(void);
int inox_process_pid(void);
inox_status inox_process_platform(inox_allocator* allocator, inox_value* out);
inox_status inox_process_version(inox_allocator* allocator, inox_value* out);
inox_status inox_process_versions_node(inox_allocator* allocator, inox_value* out);
void inox_process_set_exit_code(int code);
void inox_process_exit(int code);

#endif
