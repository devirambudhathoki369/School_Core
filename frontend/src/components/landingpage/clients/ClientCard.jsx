import { motion } from "framer-motion"

export default function ClientCard({ client, index }) {
  return (
    <motion.div
      className="group relative overflow-hidden rounded-xl bg-white p-6 shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
    >
      <div className="flex flex-col items-center text-center">
        {/* Client Logo/Image */}
        <div className="mb-4 overflow-hidden rounded-lg bg-gray-50 p-4 group-hover:bg-blue-50 transition-colors duration-300">
          <img
            src={client.image || "/placeholder.svg"}
            alt={client.name}
            className="h-12 w-auto object-contain grayscale group-hover:grayscale-0 transition-all duration-300"
          />
        </div>

        {/* Client Name */}
        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-300">
          {client.name}
        </h3>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 opacity-0 group-hover:opacity-20 transition-opacity duration-300 rounded-xl" />
    </motion.div>
  )
}
