#ifndef INOX_TIME_BRIDGE_H
#define INOX_TIME_BRIDGE_H

#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

inox_number inox_monotonic_now_ms(void);
void inox_time_sleep_ms(inox_number delay_ms);

#ifdef __cplusplus
}
#endif

#endif
