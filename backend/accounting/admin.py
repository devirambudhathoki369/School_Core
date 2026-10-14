from django.contrib import admin

# Register your models here.
from .models.AccountingEconomicYear import AccountingEconomicYear
from .models.AccountingLedger import AccountingLedger, AccountingLedgerBalance
from .models.IncomeEntry import IncomeEntry
from .models.ExpenseEntry import ExpenseEntry
from .models.JournalEntry import JournalEntry
from .models.ContraEntry import ContraEntry

#
from .models.Particulars import (
    IncomeParticular,
    ExpenseParticular,
    JournalParticular,
    ContraParticular,
)

admin.site.register(AccountingEconomicYear)
admin.site.register(AccountingLedger)
admin.site.register(AccountingLedgerBalance)
admin.site.register(IncomeEntry)
admin.site.register(ExpenseEntry)
admin.site.register(JournalEntry)
admin.site.register(ContraEntry)
# entries' particulars
admin.site.register(IncomeParticular)
admin.site.register(ExpenseParticular)
admin.site.register(JournalParticular)
admin.site.register(ContraParticular)
