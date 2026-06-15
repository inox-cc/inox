#ifndef CCJS_OS_H
#define CCJS_OS_H

#include "ccjs/allocator.h"
#include "ccjs/value.h"

ccjs_status ccjs_os_arch(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_os_homedir(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_os_hostname(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_os_platform(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_os_release(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_os_tmpdir(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_os_type(ccjs_allocator* allocator, ccjs_value* out);

#endif
