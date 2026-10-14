import { __save, __update } from "..";

const AL_PATH = "accounting/ledgers";

async function saveAccountingLedger(data) {
    if (data?.id) return __update(AL_PATH, data);
    return __save(AL_PATH, data);
}

export { saveAccountingLedger };