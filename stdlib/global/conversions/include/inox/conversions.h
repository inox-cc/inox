#ifndef INOX_CONVERSIONS_H
#define INOX_CONVERSIONS_H

#include "inox/value.h"

#ifdef __cplusplus

bool Boolean(bool value);
bool Boolean(double value);
bool Boolean(const inox::Value& value);
double i32(double value);
double u32(double value);
double u64(double value);
double f32(double value);
double f64(double value);

#endif

#endif
