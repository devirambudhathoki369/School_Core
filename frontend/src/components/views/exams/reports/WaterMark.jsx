function WaterMark({ name }) {
    return (
        <div className="absolute opacity-25 top-0 left-0 w-[105%] flex flex-wrap select-none">
            <span className="text-blue-500 text-[0.9rem] capitalize">
                {`${name.toLowerCase()} `.repeat(2500)}
            </span>
        </div>
    )
}

export default WaterMark;