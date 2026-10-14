import { useEffect, useState } from "react";
import { Button, Dialog, DialogHeader, DialogBody, DialogFooter } from "@material-tailwind/react";
import { TextInput } from ".";

/* each item in data must contain name */
function SearchDialog({ name, open, handler, title, data, onSelect, hideOptionsUntilSearch = true }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    // 
    function filterData(searchTerm) {
        if (searchTerm === "" || !searchTerm) resetFilteredData();
        else if (searchTerm?.length > 1) {
            const _data = data
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
        if (hideOptionsUntilSearch === false) setFilteredData(data);
        else setFilteredData([]);
    }
    useEffect(() => {
        resetFilteredData();
    }, []);
    // 
    return (
        <Dialog open={open} handler={handler} animate={{
            mount: { scale: 1, y: 0 },
            unmount: { scale: 0.9, y: -100 },
        }}>
            <DialogHeader>
                <div className="flex flex-col">
                    <span className="capitalize">
                        Search {title}
                    </span>
                    <TextInput input={{ name: 'name', label: 'Enter name' }} value={searchTerm}
                        onChange={onChange} />
                </div>
            </DialogHeader>
            <DialogBody>
                {filteredData?.length > 0 &&
                    <div className="flex flex-wrap gap-1">
                        {
                            filteredData.map((item, index) => (
                                <span key={index}
                                    onClick={() => {
                                        onSelect(name, item);
                                    }}
                                    className="w-max p-2 border border-black rounded-md cursor-pointer">
                                    {item.name}
                                </span>
                            ))
                        }
                    </div>
                }
            </DialogBody>
            <DialogFooter>
                <Button onClick={handler} variant="outlined">Close</Button>
            </DialogFooter>
        </Dialog>
    )
}

export default SearchDialog;