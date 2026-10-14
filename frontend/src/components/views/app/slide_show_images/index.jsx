import Carousel from "@/components/Carousel";
import { Button } from "@material-tailwind/react";
import SlideShowProvider, { useSlideShow } from "./SlideShowContext";
import { ACCEPT_STR, ALLOWED_IMAGE_TYPES } from "@/configs/file_types";
import SSImageUpload from "./SSUploadImage";
import { formatImagePath } from "@/methods/formatMediaPath";

const classes = {
    imageView: "h-[35rem] w-full object-contain rounded-xl",
};

function SlideShowImagesForm() {
    const { fileRef, newImage, images, openedImageId, username,
        methods: { updateOpenedImage, deleteImage }, status: { uploading },
    } = useSlideShow();

    return (
        <>
            <div>
                <h2 className="text-xl font-semibold leading-7 text-gray-900">Upload Images</h2>
                <p className="pl-4 mt-1 text-[0.9rem] font-semibold leading-5 text-gray-900 whitespace-pre-wrap">
                    Images here will be displayed in the mobile application!
                </p>
            </div>
            <div className="flex gap-x-2 justify-center items-start mt-7">
                <Carousel
                    className="rounded-xl w-[75%] h-[35%]"
                    onIndexChange={(index) => {
                        updateOpenedImage(index);
                    }} disabled={uploading}>
                    <div className="h-full">
                        <img
                            src={newImage?.src}
                            alt={username}
                            className={classes.imageView}
                            hidden={!newImage}
                        />
                        <SSImageUpload hidden={newImage} />
                    </div>
                    {
                        images.map((image) => (
                            <img
                                key={image.id}
                                src={formatImagePath(image?.image || null)}
                                alt={username}
                                className={classes.imageView}
                                accept={ACCEPT_STR}
                            />
                        ))
                    }
                </Carousel>
                <div className="flex flex-col gap-y-2">
                    <Button variant="filled" color="light-blue" disabled={!openedImageId} onClick={() => {
                        fileRef.current.click();
                    }}>
                        Replace
                    </Button>
                    <Button variant="filled" color="red" disabled={!openedImageId} onClick={deleteImage}>
                        Remove
                    </Button>
                </div>
            </div >
        </>
    )
}


function SlideShowImages() {
    return (
        <SlideShowProvider>
            <SlideShowImagesForm />
        </SlideShowProvider>
    )
}

export default SlideShowImages;