import { ACCEPT_STR, aitString } from "@/configs/file_types";
import { useSlideShow } from "./SlideShowContext";
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@material-tailwind/react";

function SSImageUpload({ hidden }) {
    const { fileRef, methods: { uploadImage } } = useSlideShow();

    return (
        <div className="bg-sky-400 h-full w-full grid place-items-center" hidden={hidden}>
            <input type="file" name="file" ref={fileRef} hidden onChange={uploadImage} accept={ACCEPT_STR} />
            <Button variant="text" className="hover:bg-sky-500" onClick={() => {
                fileRef.current.click();
            }}>
                <DocumentPlusIcon className="h-12 w-12 text-white" />
            </Button>
        </div>
    )
}

export default SSImageUpload;