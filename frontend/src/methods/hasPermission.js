function hasPermission(user, permission) {
    if (user?.role === "admin") return true;
    return (user?.profile?.permissions || []).includes(permission);
}

export default hasPermission;