import { object } from "yup";
import { password, username } from ".";

const loginSchema = object({
    username: username("Username"),
    password: password("Password")
});

export default loginSchema;