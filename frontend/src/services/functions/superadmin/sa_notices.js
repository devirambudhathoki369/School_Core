import { __fetch } from "@/services/functions";

export async function fetchNoticesFromSA() {
    return __fetch(`/api/notices_sa`, {}, {});
}