# must match with frontend/src/configs/payment.js constants!
TRANSPORTATION = "tn"
# HOSTEL fee. A pseudo-title, exactly like transportation: the rate is not in
# the class fee table because it is PER STUDENT — it comes from the room they
# were given (hostel.HostelAllocation.monthly_fee, snapshot at check-in).
# Following `tn` rather than inventing a parallel billing path is what makes
# hostel dues appear in reminder bills, the dues report, receipts and the trial
# balance without any of those knowing the hostel module exists.
# A hostel concession is given by writing a lower `monthly_fee` on that
# student's allocation — there is deliberately NO hostel row in
# StudentDiscountInfo, because that table encodes "transportation" as a NULL
# title and a second null-titled service could not be told apart from the first.
HOSTEL = "hs"
# The two ONE-OFF hostel charges, raised once at check-in rather than monthly.
# Separate titles rather than folded into "hs" because a receipt has to be able
# to say which of the three a guardian actually paid, and because a deposit is
# not revenue: it is money HELD, refundable at check-out, and a school's
# accountant needs it on its own line to ever give it back.
HOSTEL_ADMISSION = "hsa"
HOSTEL_DEPOSIT = "hsd"
# Every hostel-related title, for the readers that treat them as one family.
HOSTEL_TITLES = (HOSTEL, HOSTEL_ADMISSION, HOSTEL_DEPOSIT)
OLD_DUES = "od"
OPENING_BALANCE = "ob"
DISCOUNTS = "discounts"
LIBRARY_FINE = "lib_fine"
# Balancing entry written in a student's OLD academic year when promotion carries
# their outstanding balance forward into the new year as an opening balance. It
# holds the negative of the carried amount so the old year nets to zero (the dues
# are MOVED, not duplicated). Never a collectable bill on its own.
CARRY_FORWARD_OUT = "cfo"
EXCEPTION_TITLES = (
    TRANSPORTATION,
    HOSTEL,
    HOSTEL_ADMISSION,
    HOSTEL_DEPOSIT,
    OLD_DUES,
    OPENING_BALANCE,
    DISCOUNTS,
    LIBRARY_FINE,
    CARRY_FORWARD_OUT,
)
EXCEPTION_TITLES_ALTERNATIVES = {
    TRANSPORTATION: "transportation",
    HOSTEL: "hostel",
    HOSTEL_ADMISSION: "hostel admission",
    HOSTEL_DEPOSIT: "hostel deposit",
    OLD_DUES: "old dues",
    OPENING_BALANCE: "opening balance",
    LIBRARY_FINE: "library fine",
    CARRY_FORWARD_OUT: "carried forward",
}

INVOICE_DETAILS = {
    "AMOUNT": "amt",
    "DISCOUNT": "dis",
    "DUE": "due",
    "TAX_PERCENT": "tdsp",
    "TAX_AMOUNT": "tdsa",
}

# Reserved key inside StudentInvoice.details / StudentLedger.details JSON.
# Holds {title_id_as_str: FeeTitle.title} captured at the moment of write,
# so historical payment-history / ledger-history reports render the original
# receipt label even if FeeTitle is renamed or deleted later.
# Readers MUST skip this key when iterating over titles.
TITLE_NAMES_KEY = "__titles"
