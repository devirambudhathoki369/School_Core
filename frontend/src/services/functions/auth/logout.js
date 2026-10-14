import { __save } from "..";

async function logout(user) {
    return __save('/auth/logout', user);
}
export default logout;