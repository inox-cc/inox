#ifndef CCJS_TIME_H
#define CCJS_TIME_H

#include "ccjs/value.h"

typedef struct ccjs_time_adapter {
  void* user;
  ccjs_number (*monotonic_now_ms)(void* user);
  ccjs_number (*wall_now_ms)(void* user);
} ccjs_time_adapter;

void ccjs_time_set_adapter(ccjs_time_adapter adapter);
void ccjs_time_reset_adapter(void);
void ccjs_time_resync_wall_clock(void);
ccjs_number ccjs_performance_now(void);
ccjs_number ccjs_date_now(void);
void ccjs_time_sleep_ms(ccjs_number delay_ms);

#endif
