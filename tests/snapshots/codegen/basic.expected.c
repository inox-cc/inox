#include <stdio.h>

double add(double left, double right);

double add(double left, double right) {
  double ccjs_return = 0;
  ccjs_return = (left + right);
  goto ccjs_cleanup;
ccjs_cleanup:
  return ccjs_return;
}

int main(void) {
  double ccjs_return = 0;
  const double total = add(2, 3);
  printf("total %g\n", ((double)total));
ccjs_cleanup:
  return (int)ccjs_return;
}
