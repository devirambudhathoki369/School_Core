let payment = {
    student: 1, // student-id;
    school: 1, // school-id;
    payments: [] // {title, paid_months, total}
};

function updatePayment({ name, value: { title, rate, month } }) {
    console.log(`>>> ADDING [title : ${title}] [rate : ${rate}] [month : ${month}];`);
    if (name === 'payment') {
        const nps = { ...payment };
        const titleIndex = nps.payments.findIndex(e => e.title === title); // -1 ? not found : found;
        // titleIndex (title found) ? update title : add title;
        if (titleIndex > -1) {
            if (nps.payments[titleIndex].paid_months.includes(month)) {
                // remove month from title's paid_months if found;
                nps.payments[titleIndex].paid_months = nps.payments[titleIndex].paid_months.filter(m => m != month);
                nps.payments[titleIndex].total -= rate;
            } else {
                // add new month to the title's paid_months;
                nps.payments[titleIndex].paid_months.push(month);
                nps.payments[titleIndex].total += rate;
            }
        } else {
            console.log('>>> -- NEW TITLE --;');
            nps.payments.push({ title, paid_months: [month], total: rate });
        }
        payment = { ...nps };
        return nps;
    }
}

function print() {
    console.log('-------------------------------------------------------------------------');
    console.dir(payment, { 'depth': null });
}

// TESTING
const name = 'payment';
let title = 1, // monthly fee;
    rate = 1000;
updatePayment({ name, value: { title, rate, month: 1 } });
updatePayment({ name, value: { title, rate, month: 2 } });
updatePayment({ name, value: { title, rate, month: 3 } });
updatePayment({ name, value: { title, rate, month: 4 } });
updatePayment({ name, value: { title, rate, month: 5 } });
print();
updatePayment({ name, value: { title, rate, month: 2 } });
print();
// 
title = 2, // exam;
    rate = 500;
updatePayment({ name, value: { title, rate, month: 3 } });
updatePayment({ name, value: { title, rate, month: 6 } });
updatePayment({ name, value: { title, rate, month: 9 } });
updatePayment({ name, value: { title, rate, month: 12 } });
print();