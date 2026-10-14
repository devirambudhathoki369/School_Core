import { motion } from "framer-motion"
import { RocketLaunchIcon, HeartIcon, StarIcon } from "@heroicons/react/24/solid"
import FeatureCard from "./FeatureCard"

export default function FeatureCards({ containerVariants, itemVariants }) {
    const features = [
        {
            icon: RocketLaunchIcon,
            title: "Fast",
            description: "Lightning-fast performance with modern technologies",
            bgColor: "bg-gradient-to-br from-purple-500 to-teal-500",
            iconColor: "text-white",
        },
        {
            icon: HeartIcon,
            title: "Beautiful",
            description: "Stunning designs that users love",
            bgColor: "bg-gradient-to-br from-purple-500 to-teal-500",
            iconColor: "text-white",
        },
        {
            icon: StarIcon,
            title: "Quality",
            description: "Premium quality in every detail",
            bgColor: "bg-gradient-to-br from-purple-500 to-teal-500",
            iconColor: "text-white",
        },
    ]

    return (
        <motion.div className="grid md:grid-cols-3 gap-8 mb-16" variants={containerVariants}>
            {features.map((feature, index) => (
                <FeatureCard
                    key={index}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                    bgColor={feature.bgColor}
                    iconColor={feature.iconColor}
                    variants={itemVariants} />
            ))}
        </motion.div>
    )
}
