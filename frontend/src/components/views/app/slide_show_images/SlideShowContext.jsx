import { confirmAction } from "@/components/ConfirmDialog";
import { ALLOWED_IMAGE_TYPES, MAX_SIZE, aitString } from "@/configs/file_types";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __delete, __fetch, __save, __update } from "@/services/functions";
import { createContext, useContext, useEffect, useRef, useState } from "react";

const SlideShowContext = createContext({});

const useSlideShow = () => useContext(SlideShowContext);

const API_PATH = "/api/school/images";
const name = "image";

function SlideShowProvider({ children }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [openedImage, setOpenedImage] = useState(null);
    const [images, setImages] = useState([]);
    const [imagesIdsMappedByIndex, setImageIdsMappedByIndex] = useState({});
    const [openedImageId, setOpenedImageId] = useState('');
    const { uploading, statusHandler } = useRequestStatus();

    const schoolId = user?.profile?.school || user?.profile?.id;
    const fileRef = useRef(null);

    function updateOpenedImage(index) {
        setOpenedImageId(imagesIdsMappedByIndex?.[index] || "");
    }

    function isSizeValid(fileSize) {
        return (fileSize / 1024 / 1024) < MAX_SIZE;
    }
    async function uploadImage(e) {
        setOpenedImage(null);
        const file = e.target.files?.[0] || null;
        if (!file) return;
        if (!isSizeValid(file.size) || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
            updateNotification('', `File ${file.name} must be less than ${MAX_SIZE}MB and ${aitString}!`);
            return;
        }
        if (await confirmAction({
            title: "Upload this image?",
            body: "It replaces the picture currently in this slide-show position.",
            tone: "info",
            confirmText: "Upload",
        })) {
            statusHandler.toggleUploading();
            // submit the form
            const data = new FormData();
            data.append("school", schoolId);
            data.append(name, file);
            if (openedImageId) data.append("id", openedImageId);
            const [status, message, res] = await onSubmit(data);
            updateNotification(status, message);
            e.target.value = '';
            if (res?.image) {
                setImages(state => {
                    let ns = [...state];
                    if (openedImageId) {
                        // update;
                        ns = ns.map(e => e?.id === openedImageId ? res.image : e);
                    } else {
                        // new;
                        ns.push(res.image);
                        setImageIdsMappedByIndex(state => ({ ...state, [ns.length]: res.image.id }));
                    }
                    return ns;
                });
            }
            statusHandler.toggleUploading();
        }
    }
    async function onSubmit(data) {
        let image_id;
        try {
            image_id = data?.id || data.get("id");
        } catch (error) { }
        if (image_id) return __update(API_PATH, data);
        return __save(API_PATH, data);
    }
    async function deleteImage() {
        if (!openedImageId || !schoolId) {
            updateNotification(404, "Image not found!");
            return;
        }
        statusHandler.toggleUploading();
        const [status, message,] = await onDelete(openedImageId);
        updateNotification(status, message);
        statusHandler.toggleUploading();
        if (status === 200) {
            setImages(prevImages => prevImages.filter(image => image?.id !== openedImageId));
        }
    }
    async function onDelete(id) {
        return __delete(API_PATH, { id: id, school: schoolId });
    }
    // 
    useEffect(() => {
        async function fetchImages() {
            const _images = await __fetch(API_PATH, { school: schoolId });
            if (_images && _images?.length > 0) {
                const imageIds = _images.reduce((acc, img, index) => {
                    // index==0 consists file upload component, so add index by 1!
                    acc[index + 1] = img.id;
                    return acc;
                }, {});
                setImageIdsMappedByIndex(imageIds);
                setImages(_images);
            }
        }

        fetchImages();
    }, []);
    // 
    return (
        <SlideShowContext.Provider value={{
            fileRef, openedImage, openedImageId, images,
            methods: { updateOpenedImage, uploadImage, deleteImage },
            status: { uploading },
            username: user?.profile?.school_name || user?.profile?.name || "",
        }}>
            {children}
        </SlideShowContext.Provider>
    )
}

export default SlideShowProvider;
export { useSlideShow };