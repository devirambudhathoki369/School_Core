import { useEffect, useState } from "react";
import { Button, Dialog, DialogHeader, DialogBody, DialogFooter } from "@material-tailwind/react";
import { TextInput } from ".";
import EmptyState from "@/components/EmptyState";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

/* each item in data must contain name */
function SearchDialog({ name, open, handler, title, data = [], onSelect, hideOptionsUntilSearch = true, emptyMessage }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    // 
    function filterData(searchTerm) {
        if (searchTerm === "" || !searchTerm) resetFilteredData();
        else if (searchTerm?.length > 1) {
            const _data = (data || [])
                .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
            // console.log(_data);
            setFilteredData(_data);
        }
    }
    function onChange({ _, value }) {
        setSearchTerm(value);
        filterData(value);
    }
    function resetFilteredData() {
        if (hideOptionsUntilSearch === false) setFilteredData(data || []);
        else setFilteredData([]);
    }
    useEffect(() => {
        if (!open) return;
        setSearchTerm('');
        resetFilteredData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, data]);
    // 
    return (
        <Dialog open={open} handler={handler} size="md" animate={{
            mount: { scale: 1, y: 0 },
            unmount: { scale: 0.9, y: -100 },
        }}>
            <DialogHeader className="flex flex-col items-start border-b border-blue-gray-50 px-5 py-4">
                <span className="text-lg font-semibold normal-case">{title}</span>
                <span className="mt-1 text-sm font-normal text-gray-500">Choose one available option for this period.</span>
            </DialogHeader>
            <DialogBody className="min-h-[18rem] px-5 py-4">
                {(data || []).length > 0 ? <>
                    <div className="max-w-md">
                        <TextInput input={{ name: 'name', label: 'Search available options' }} value={searchTerm}
                            prefix={<MagnifyingGlassIcon className="ml-2 h-4 w-4 text-gray-400" />} onChange={onChange} />
                    </div>
                    {filteredData?.length > 0 ?
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {
                            filteredData.map((item, index) => (
                                <button type="button" key={item?.value || index}
                                    onClick={() => {
                                        onSelect(name, item);
                                    }}
                                    className="rounded-lg border border-blue-gray-100 bg-white p-3 text-left text-sm font-semibold text-gray-800 transition hover:border-blue-400 hover:bg-blue-50">
                                    {item.name}
                                </button>
                            ))
                        }
                    </div> :
                    <p className="mt-6 rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                        {searchTerm ? `No option matches “${searchTerm}”.` : "Type at least two letters to search."}
                    </p>}
                </> :
                    <EmptyState title="Nothing available to assign" hint={emptyMessage || "Complete the related setup first, then return to this period."} />}
            </DialogBody>
            <DialogFooter className="border-t border-blue-gray-50 px-5 py-3">
                <Button onClick={handler} variant="outlined">Close</Button>
            </DialogFooter>
        </Dialog>
    )
}

export default SearchDialog;
