import React, { useState, useCallback, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const Carousel = ({
    children,
    className = '',
    PreviousButton,
    NextButton,
    CustomDot,
    onIndexChange = () => null,
}) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const containerRef = useRef(null);
    const slides = React.Children.toArray(children);

    // Navigation functions
    const goToSlide = useCallback((index) => {
        let newIndex = index;
        if (index < 0) newIndex = slides.length - 1;
        if (index >= slides.length) newIndex = 0;
        setCurrentSlide(newIndex);
        onIndexChange(newIndex);
    }, [slides]);

    const nextSlide = useCallback(() => {
        goToSlide(currentSlide + 1);
    }, [currentSlide, goToSlide]);

    const previousSlide = useCallback(() => {
        goToSlide(currentSlide - 1);
    }, [currentSlide, goToSlide]);

    // Default navigation buttons
    const DefaultPreviousButton = ({ onClick }) => (
        <button
            onClick={onClick}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-colors"
            aria-label="Previous slide"
        >
            <ChevronLeftIcon className="w-6 h-6" />
        </button>
    );

    const DefaultNextButton = ({ onClick }) => (
        <button
            onClick={onClick}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-colors"
            aria-label="Next slide"
        >
            <ChevronRightIcon className="w-6 h-6" />
        </button>
    );

    const DefaultDot = ({ active, onClick }) => (
        <button
            onClick={onClick}
            className={`block h-1 cursor-pointer rounded-2xl transition-all content-[''] ${active ? "w-8 bg-white" : "w-4 bg-white/50"}`}
            aria-label={`Go to slide ${active ? '(current)' : ''}`}
        />
    );

    const NavigationButton = {
        Previous: PreviousButton || DefaultPreviousButton,
        Next: NextButton || DefaultNextButton,
        Dot: CustomDot || DefaultDot,
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden ${className}`}
            tabIndex={0}
            role="region"
            aria-label="Image carousel"
        >
            <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            // onContextMenu={(e) => e.preventDefault()}
            >
                {slides.map((slide, index) => (
                    <div key={index} className="w-full h-[35rem] flex-shrink-0">
                        {slide}
                    </div>
                ))}
            </div>

            <NavigationButton.Previous onClick={previousSlide} />
            <NavigationButton.Next onClick={nextSlide} />

            <div className="absolute bottom-4 left-1/2 bg-black/50 px-4 py-2 rounded-full -translate-x-1/2 flex space-x-2">
                {slides.map((_, index) => (
                    <NavigationButton.Dot
                        key={index}
                        active={currentSlide === index}
                        onClick={() => goToSlide(index)}
                    />
                ))}
            </div>
        </div>
    );
};

export default Carousel;