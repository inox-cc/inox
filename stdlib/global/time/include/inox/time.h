#ifndef INOX_TIME_H
#define INOX_TIME_H

#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_time_adapter {
  void* user;
  inox_number (*monotonic_now_ms)(void* user);
  inox_number (*wall_now_ms)(void* user);
} inox_time_adapter;

void inox_time_set_adapter(inox_time_adapter adapter);
void inox_time_reset_adapter(void);
void inox_time_resync_wall_clock(void);
inox_number inox_performance_now(void);
inox_number inox_date_now(void);
inox_number inox_date_parse(const char* bytes, size_t len);
inox_number inox_date_utc(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
);
inox_number inox_date_from_local(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
);
inox_number inox_date_get_part(inox_number value, int part, bool utc);
inox_number inox_date_get_timezone_offset(inox_number value);
inox_status inox_date_to_string(inox_allocator* allocator, inox_number value, int kind, inox_value* out);
void inox_time_sleep_ms(inox_number delay_ms);

#ifdef __cplusplus
}
#endif

#endif
