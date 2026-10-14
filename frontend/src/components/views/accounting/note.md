Steps for Income and Expense entry:
1. Enter date
2. Payment method
3. Select ledger
    - Options:
        - if `payment_method` is `cash`, show ledgers in `Cash In Hand` ledger_group.
        - if `payment_method` is `bank`, show ledgers in `Bank Account` ledger_group.
4. Table ledgers selection
    - Options:
        - Show ledgers in `Direct/Indirect Income/Expense` ledger_group.
5. and [school, economic_year]
6. Save/Edit.

### MODELS

- AccountingEconomicYear
    - Same as economic-year + school.

- LEDGER
    - {name, date, address, contact, opening-balance, balance-type: [dr/cr], school, remarks}

* Entries below must contain 
    ```js
        {date, economic-year, school, voucher_no, remarks}
    ```
- all must be inherited from main.BaseModel
- voucher_no is based on economic-year and is different in all entries.
- voucher_no : `VOUCHER_TYPE-NUMBER`. (save number only, but return in that format.)

- INCOME ENTRY
    - {school, date, mode: [cash/bank], ledger: fk, economic_year: AccountingEconomicYear, remarks}
    - will contain particulars[]
        - particular {ledger, amount, narration}

- EXPENSE ENTRY
    - same as income entry

- Journal Entry
    - {school, date, economic_year, remarks}
    - will contain particulars[]
        - particular {ledger, type: [dr/cr], amount, narration}

- Contra Entry
    - {school, date, ledger, economic-year, remarks}
    - will contain particulars[]
        - particular {ledger, amount, narration}

<!--  -->
1. Schema for Income and Expense entries are same!
2. 