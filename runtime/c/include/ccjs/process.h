#ifndef CCJS_PROCESS_H
#define CCJS_PROCESS_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

void ccjs_process_init(int argc, char** argv);
ccjs_status ccjs_process_argv(ccjs_allocator* allocator, int index, ccjs_value* out);
ccjs_status ccjs_process_cwd(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_process_env(ccjs_allocator* allocator, const char* name, size_t name_len, ccjs_value* out);
int ccjs_process_get_exit_code(void);
void ccjs_process_set_exit_code(int code);
void ccjs_process_exit(int code);

#endif
