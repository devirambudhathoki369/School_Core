import { months } from "@/components/inputs/options/months";

/**
 * requires months as [<int>] i.e. [1,2,3] where 1 means baisakh. \
 * returns [baisakh, jestha, ashad].
 */
export default function monthsMapper(data) {
    return (
        data?.length === 12 ? ['All months'] :
            data
                .sort((a, b) => (a - b))
                .map(month => months[month])
    );
}