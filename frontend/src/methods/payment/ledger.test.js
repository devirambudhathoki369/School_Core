/* 
prev = 2000
2075*3 - 1035*3 = 3120 [new total]
2075*1 - 1035*1 = 1040 [2000+1040=3040]
3120-3040 = 80

prev = 3040
2075*2 - 1035*2 = 2080
2075*1 - 1035*1 = 1040 [3040+1040=4080]
2080-4080 = -200 WRONG

prev = 3040
2075*2 - 1035*2 = 2080
2075*1 - 1035*1 = 1040 [3040-1040=2000]
2080-2000 = 80 RIGHT

NOTE:
nt > prev : prev + one_month_amount
nt < prev : prev - one_month_amount
*/

function calculateTotal(prevTotal, pmc, rate, discountRate) {
    let newTotal = (rate * pmc) - (discountRate * pmc);
    const oneMonthTotal = (rate * 1) - (discountRate * 1);
    if (newTotal > prevTotal) {
        return prevTotal + oneMonthTotal;
    } else if (newTotal < prevTotal) {
        return prevTotal - oneMonthTotal;
    } else if (newTotal < 1) return prevTotal;
    return newTotal;
}

console.log(`case rate, discount
    pmc, total, total-w/o-discount, discount, correct?
`);

function case1() {
    // full discount on title and manually updating ledger at 2nd iter!! works;
    const ops = [, 0, 1440, 1440, 1440];
    let total = 0, pmc = 1, rate = 2075, discount = 2075;
    console.log("CASE 1", rate, discount);
    for (pmc; pmc <= 4; pmc++) {
        if (pmc === 2) {
            console.log('from', total, 'to', 1440, 'for next iter');
            total = 1440; // manually setting
        }
        total = calculateTotal(total, pmc, rate, discount);
        console.log(pmc, total, pmc * rate, discount * pmc, total === ops[pmc]);
    }
}

function case2() {
    // just with discount
    const ops = [, 1040, 2080, 3120, 4160];
    let total = 0, pmc = 1, rate = 2075, discount = 1035;
    console.log("CASE 2", rate, discount);
    for (pmc; pmc <= 4; pmc++) {
        total = calculateTotal(total, pmc, rate, discount);
        console.log(pmc, total, pmc * rate, discount * pmc, total === ops[pmc]);
        // assert(total === ops[pmc], `Expected ${ops[pmc]}`);
    }
}

function case3() {
    // unselecting months means reducing pmc;
    let ops = [, 1040, 2080, 3040, 4080]
    let total = 0, pmc = 1, rate = 2075, discount = 1035;
    console.log("### CASE 3", rate, discount);
    for (pmc; pmc <= 4; pmc++) {
        if (pmc === 3) {
            console.log('from', total, 'to', 2000, 'for next iter');
            total = 2000;
        }
        total = calculateTotal(total, pmc, rate, discount);
        console.log(pmc, total, pmc * rate, discount * pmc, total === ops[pmc]);
    }
    console.log('part II');
    ops = [880, 1920, 2960, 3040, 4080, 5120];
    console.log(ops);
    for (pmc; pmc >= 0; pmc--) {
        if (pmc === 2) {
            console.log('from', total, 'to', 4000, 'for next iter');
            total = 4000;
        }
        total = calculateTotal(total, pmc, rate, discount);
        console.log(pmc, total, pmc * rate, discount * pmc, total === ops[pmc]);
    }
}

case1();
case2();
case3();