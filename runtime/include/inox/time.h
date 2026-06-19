#ifndef INOX_TIME_H
#define INOX_TIME_H

#include "inox/value.h"

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
void inox_time_sleep_ms(inox_number delay_ms);

#endif
