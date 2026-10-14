export const CardOptions = {
    "student": 1,
    "staff": 2,
};

export const CardSelectOptions = Object.entries(CardOptions)
    .reduce((acc, option) => {
        const [name, value] = option;
        acc.push({ name, value });
        return acc;
    }, []);