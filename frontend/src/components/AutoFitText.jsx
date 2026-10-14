import { Typography } from '@material-tailwind/react';
import { useState, useEffect, useRef, useMemo } from 'react';

const AutoFitText = ({ children, parentWidth = 1, className = '', MinFontSize = 1, MaxFontSize = 1 }) => {
    parentWidth = (parentWidth / 100) * window.innerWidth * (1 / window.devicePixelRatio);

    const [fontSize, setFontSize] = useState(MaxFontSize);
    const textRef = useRef(null);

    const calculateFontSize = useMemo(() => {
        let newFontSize = MaxFontSize;

        const context = document.createElement('canvas').getContext('2d');
        while (newFontSize >= MinFontSize) {
            context.font = `${newFontSize}px Arial`;
            const textWidth = context.measureText(children).width;

            if (textWidth <= parentWidth) {
                break;
            }
            newFontSize--;
        }

        return newFontSize;
    }, [children, parentWidth]);

    useEffect(() => {
        setFontSize(calculateFontSize);
    }, [calculateFontSize]);

    return (
        <Typography
            ref={textRef}
            variant="paragraph"
            style={{
                width: `100%`,
                fontSize: `${fontSize}px`,
                lineHeight: '1.5',
                whiteSpace: 'nowrap',
                margin: 0,
                padding: 0,
            }}
            className={className}
        >
            {children}
        </Typography>
    );
};

export default AutoFitText;