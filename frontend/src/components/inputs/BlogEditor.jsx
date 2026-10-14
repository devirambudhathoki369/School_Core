'use client';

import React, { useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(
    async () => {
        const { default: RQ } = await import('react-quill');
        // eslint-disable-next-line react/display-name
        return ({ forwardedRef, ...props }) => <RQ ref={forwardedRef} {...props} />;
    },
    { ssr: false }
);
import 'react-quill/dist/quill.snow.css';
// 
import { __update } from '@/services/functions';
import { ACCEPT_STR, ALLOWED_IMAGE_TYPES, MAX_SIZE, aitString } from '@/configs/file_types';
import { useAppContext } from '@/contexts/AppContext';

const BlogEditor = ({ content, onChange, onFileInsert, placeholder = 'Start writing...' }) => {
    const { notification: { updateNotification } } = useAppContext();
    const quillRef = useRef(null);
    const fileInputRef = useRef(null);

    const insertImage = (url) => {
        const editorInstance = quillRef.current?.getEditor();
        if (editorInstance) {
            const range = editorInstance.getSelection(true);
            editorInstance.insertEmbed(range.index, 'image', url);
            editorInstance.setSelection(range.index + 1);
        }
    };

    function isSizeValid(fileSize) {
        return (fileSize / 1024 / 1024) < MAX_SIZE;
    }
    async function onFileChange(e) {
        const file = e.target.files?.[0] || null;
        if (!file) return;
        if (!isSizeValid(file.size) || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
            updateNotification('', `File ${file.name} must be less than ${MAX_SIZE}MB and ${aitString}!`);
            return;
        }

        if (onFileInsert) {
            const url = await onFileInsert(file);
            if (url) insertImage(url);
        } else {
            insertImage(imageUrl);
        }
        e.target.value = '';
    };

    const handleImageUpload = () => {
        fileInputRef.current?.click();
    };
    const modules = useMemo(() => {
        const updatedModules = { ..._modules };
        updatedModules.toolbar.handlers.image = handleImageUpload;
        return updatedModules;
    }, [handleImageUpload]);

    return (
        <div className="w-full my-2 mx-auto !text-base rounded-md">
            <div className="h-3/4">
                <ReactQuill
                    forwardedRef={quillRef}
                    value={content}
                    onChange={onChange}
                    modules={modules}
                    formats={formats}
                    className="h-full quill-editor"
                    placeholder={placeholder}
                />
            </div>

            <input type="file" name="file" accept={ACCEPT_STR} ref={fileInputRef} hidden onChange={onFileChange} />
        </div>
    );
};

const _modules = {
    toolbar: {
        container: [
            [{ header: [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
            [{ color: [] }],
            ['link', 'image'],
            ['clean'],
        ],
        handlers: {
            image: null, // updated it inside component!
        },
    },
};
const formats = [
    'header', 'bold', 'italic', 'underline',
    'list', 'bullet', 'indent', 'link', 'image',
    'color',
];

export default BlogEditor;