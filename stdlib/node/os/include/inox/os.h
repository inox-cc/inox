#ifndef INOX_OS_H
#define INOX_OS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "inox/allocator.h"
#include "inox/value.h"

inox_status inox_os_arch(inox_allocator* allocator, inox_value* out);
inox_status inox_os_homedir(inox_allocator* allocator, inox_value* out);
inox_status inox_os_hostname(inox_allocator* allocator, inox_value* out);
inox_status inox_os_platform(inox_allocator* allocator, inox_value* out);
inox_status inox_os_release(inox_allocator* allocator, inox_value* out);
inox_status inox_os_tmpdir(inox_allocator* allocator, inox_value* out);
inox_status inox_os_type(inox_allocator* allocator, inox_value* out);

#ifdef __cplusplus
}
#endif

#endif
