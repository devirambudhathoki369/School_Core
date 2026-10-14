BALANCE_TYPE_CHOICES = [(1, "Dr."), (2, "Cr.")]
PAYMENT_MODE_CHOICES = [(1, "Cash"), (2, "Bank")]
# 18 digits (up to 9,999,999,999,999,999.99) so large institutional amounts
# never overflow on save. Was 10 (capped at ~10 crore) which silently rejected
# big vouchers/balances.
BALANCE_CONFIG = {"max_digits": 18, "decimal_places": 2, "default": 0}
