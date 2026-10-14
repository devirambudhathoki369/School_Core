const monthOptions = [
    { name: 'baisakh', value: 1 },
    { name: 'jestha', value: 2 },
    { name: 'ashad', value: 3 },
    { name: 'shrawn', value: 4 },
    { name: 'bhadra', value: 5 },
    { name: 'ashoj', value: 6 },
    { name: 'kartik', value: 7 },
    { name: 'mangsir', value: 8 },
    { name: 'poush', value: 9 },
    { name: 'magh', value: 10 },
    { name: 'falgun', value: 11 },
    { name: 'chaitra', value: 12 }
];

export const months = ['0th index', ...monthOptions.map(month => month.name)];

export default monthOptions;