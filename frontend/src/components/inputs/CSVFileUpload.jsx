import { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useRef } from 'react';
import Papa from 'papaparse';
import { Button, Tooltip, Card, Typography } from "@material-tailwind/react";
import { ArrowUpCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";

function CSVFileUpload({ hasHeaders = true, onReadComplete }) {
    const { notification: { updateNotification } } = useAppContext();
    const fileInputRef = useRef();
    const [file, setFile] = useState({});
    const [grid, setGrid] = useState({});

    function isFileInputValid(data) {
        // TODO: 
        return true;
    }
    function handleCSV(headers, data) {
        // console.log(headers, data);
        if (isFileInputValid(data)) {
            setGrid({ rows: data.length, cols: headers.length });
            onReadComplete(data);
        } else {
            setFile({});
            updateNotification('', "Invalid file input!");
            onReadComplete([]);
        }
    }
    function readFile(e) {
        const file = e.target.files[0];
        if (file) {
            setFile(file);
            Papa.parse(file, {
                complete: function (results) {
                    // console.log("Finished:", results);
                    let headers, data;
                    if (hasHeaders) {
                        ([headers, ...data] = results.data);
                    } else {
                        data = results.data;
                        headers = data[0];
                    }
                    handleCSV(headers, data);
                },
                beforeFirstChunk: (chunk) => {
                    return chunk.replace(/^\s*[\r\n]/gm, '');
                }
            });
        } else {
            // console.log('no-file!');
        }
        e.target.value = "";
    }

    function onFileUpload() {
        fileInputRef.current.click();
    }

    function onDeselect() {
        setFile({});
        setGrid({});
    }

    return (
        <>
            {
                <>
                    <input type="file" hidden ref={fileInputRef} accept=".csv" onChange={readFile} />
                    <div className="flex my-3 bg-teal-200 rounded-lg">
                        <Card className="h-full w-full cursor-pointer flex flex-row items-center p-3 gap-x-2 bg-transparent hover:bg-gray-900/10" onClick={onFileUpload}>
                            <Typography variant="h6" color="blue-gray">
                                UPLOAD CSV FILE!
                            </Typography>
                            <ArrowUpCircleIcon className="w-6 h-6" />
                            {file.name &&
                                <span className="mx-2 flex gap-x-2">
                                    <span>Filename : {file.name}</span>
                                    <span>[{grid?.rows} x {grid?.cols}]</span>
                                </span>
                            }
                        </Card>
                        <div className="flex gap-x-2">
                            <Tooltip content="Deselect file">
                                <Button variant="text" className="leading-none" onClick={onDeselect}>
                                    <PlusCircleIcon className="w-6 h-6 rotate-45" />
                                </Button></Tooltip>
                        </div>
                    </div>
                </>
            }
        </>
    )
}

export default CSVFileUpload;