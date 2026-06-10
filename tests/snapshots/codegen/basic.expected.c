#include <stdio.h>

double add(double left, double right);
void ccjs_main(void);

double add(double left, double right) {
  double ccjs_return = 0;
  ccjs_return = (left + right);
  goto ccjs_cleanup;
ccjs_cleanup:
  return ccjs_return;
}

void ccjs_main(void) {
  const double total = add(2, 3);
  printf("total %g\n", ((double)total));
}

int main(void) {
  ccjs_main();
  return 0;
}
