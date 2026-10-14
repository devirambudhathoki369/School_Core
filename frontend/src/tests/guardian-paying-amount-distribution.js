let guardianPayingAmount;
const studentLedger = {
    rates: {
        "13": 1400,
        "14": 4125,
        "15": 2740,
        "16": 645,
        "17": 325,
        "19": 100,
        "tn": 350
    }
};
const selectedBills = {
    "13": 0,
    "15": 19180,
    "od": 15000,
    "tn": 700,
    "19": 0
}


function guardianPayingAmountDistribution() {
    let _pa = guardianPayingAmount;
    console.log(_pa, "to", selectedBills);
    // 
    const sortedBills = new Map();
    if (selectedBills?.["od"] > 0) sortedBills.set("od", selectedBills["od"]);
    Object.entries(selectedBills || {})
        .sort((a, b) => b[1] - a[1])
        .map(e => sortedBills.set(e[0], e[1]));
    // const sortedRates = new Map(Object.entries(studentLedger?.rates || {})
    //     .filter(([key,]) => sortedBills.get(key) === 0)
    //     .sort((a, b) => b[1] - a[1]));
    // 
    const _selectedBills = new Map();
    sortedBills.forEach((val, key) => {
        const pafk = _pa > val ? val : _pa;
        _selectedBills.set(key, pafk);
        _pa -= pafk;
    });
    // sortedRates.forEach((val, key) => {
    //     let pafk = _pa > val ? _pa : val;
    //     _pa -= pafk;
    //     pafk += (_selectedBills.get(key) || 0);
    //     _selectedBills.set(key, pafk);
    //     console.log('rem>', _pa);
    // })
    console.log("rates", studentLedger.rates);
    console.log("sorted-bills", sortedBills);
    // console.log("sorted-rates", sortedRates);
    console.log("REM", _pa);
    return _selectedBills;
}

guardianPayingAmount = 0;
guardianPayingAmount = 5000;
guardianPayingAmount = 10000;
guardianPayingAmount = 15000;
guardianPayingAmount = 25000;
guardianPayingAmount = 35000;
guardianPayingAmount = 45000;
console.log(guardianPayingAmountDistribution());