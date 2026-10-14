function formatSubjectName(name) {
    name = name.split(' ');
    let size = 0;
    name.map((e, i) => {
        if (size < 20) {
            size += e.length;
            if (i > 0) {
                name[i - 1] += ' ' + e;
                name[i] = '';
            }
        } else size = 0;
    });
    name = name.filter(e => e).join(' \n');
    return name;
}

export default formatSubjectName;