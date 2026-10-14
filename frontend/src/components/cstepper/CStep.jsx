import { Step, Typography } from "@material-tailwind/react";

function CStep({ title, description, icon, step, activeStep, onClick }) {
    return (
        <Step onClick={() => onClick(step)}>
            {icon}
            <div className="absolute -bottom-[4.5rem] w-max text-center">
                <Typography
                    variant="h6"
                    color={activeStep === step ? "blue-gray" : "gray"}
                >
                    {title}
                </Typography>
                <Typography
                    color={activeStep === step ? "blue-gray" : "gray"}
                    className="font-normal"
                >
                    {description}
                </Typography>
            </div>
        </Step>
    )
}

export default CStep;