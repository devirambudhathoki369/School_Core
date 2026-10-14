import { motion } from "framer-motion"
import { StarIcon } from "@heroicons/react/24/solid"

export default function TestimonialCard({ testimonial, index }) {
  return (
    <motion.div
      className="group relative rounded-2xl bg-white p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -5 }}>
      {/* Quote decoration */}
      <div className="absolute top-4 right-4 text-6xl text-purple-100 font-serif leading-none">"</div>

      <div className="relative z-10">
        {/* Rating */}
        <div className="flex items-center mb-4">
          {[...Array(testimonial.rating)].map((_, i) => (
            <StarIcon key={i} className="w-5 h-5 text-yellow-400" />
          ))}
        </div>

        {/* Content */}
        <p className="text-black leading-relaxed mb-6 italic font-sans">"{testimonial.content}"</p>

        {/* Author */}
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <img
              src={testimonial.image || "/placeholder.svg"}
              alt={testimonial.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 transition-colors duration-300" />
          </div>
          <div className="ml-4">
            <h4 className="text-lg font-semibold text-black transition-colors duration-300 font-serif">
              {testimonial.name}
            </h4>
            <p className="text-sm text-black font-sans">
              {testimonial.role} at {testimonial.institution}
            </p>
          </div>
        </div>
      </div>

      {/* Hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-teal-50 opacity-0 group-hover:opacity-30 transition-opacity duration-300 rounded-2xl" />
    </motion.div>
  )
}
