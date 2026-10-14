function showOnlyClass(classname) {
    // classnames arrive title-cased from the backend ("School Five",
    // "School (GOVT.) Five") — strip the level prefix case-insensitively
    if (classname) return classname.replace(/^school (?:\(govt\.?\) )?(?=\w+)/i, '');
    return "";
}

export default showOnlyClass;