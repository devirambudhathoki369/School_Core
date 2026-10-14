import { __fetch, __save, __update, __delete } from ".";

const SPLASH = "/api/splash";

// active splash for the logged-in user (shown at login)
export async function getActiveSplash() {
    const data = await __fetch(`${SPLASH}/active`);
    return data?.splash || null;
}

// superadmin management
export async function getSplashNotices() {
    return __fetch(SPLASH);
}
export async function saveSplashNotice({ id, title, message, image, is_active }) {
    const fd = new FormData();
    if (id) fd.append("id", id);
    fd.append("title", title || "");
    fd.append("message", message || "");
    fd.append("is_active", is_active ? "true" : "false");
    if (image) fd.append("image", image, image.name);
    return id ? __update(SPLASH, fd, false) : __save(SPLASH, fd, false);
}
export async function deleteSplashNotice(id) {
    return __delete(SPLASH, { id });
}
