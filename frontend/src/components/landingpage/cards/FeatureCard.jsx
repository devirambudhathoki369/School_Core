import { motion } from "framer-motion"

export default function FeatureCard({ icon: Icon, title, description, bgColor, iconColor, variants }) {
    return (
        <motion.div variants={variants} whileHover={{ y: -5 }}>
            <div className="h-full bg-white rounded-xl shadow-lg p-6 text-center">
                <motion.div
                    className={`mx-auto mb-4 w-16 h-16 ${bgColor} rounded-full flex items-center justify-center`}
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.5 }}                >
                    <Icon className={`h-8 w-8 ${iconColor}`} />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2 text-black">{title}</h3>
                <p className="text-black">{description}</p>
            </div>
        </motion.div>
    )
}
