import { __fetch, __save, __delete } from "@/services/functions";

const SHAREHOLDERS_API = "/api/shareholders";

export async function fetchShareholders(school = "") {
    return __fetch(SHAREHOLDERS_API, school ? { school } : {}, {});
}

export async function saveShareholder(data) {
    return __save(SHAREHOLDERS_API, data);
}

export async function deleteShareholder(id) {
    return __delete(SHAREHOLDERS_API, { id }, {});
}
