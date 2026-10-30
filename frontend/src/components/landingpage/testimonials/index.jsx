import { motion } from "framer-motion"
import TestimonialCard from "./TestimonialCard"
import { testimonials } from "../data/content"
import { StarIcon } from "@heroicons/react/24/solid"

export default function TestimonialsSection() {
  return (
    <section className="py-24 sm:py-32 bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">What Our Clients Say</h2>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Hear from educational leaders who have transformed their institutions with SchoolCore.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-2">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} index={index} />
          ))}
        </div>

        {/* Trust indicators */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}>
          <div className="inline-flex items-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <StarIcon key={i} className="w-4 h-4 text-yellow-400" />
                ))}
              </div>
              <span>4.9/5 Average Rating</span>
            </div>
            <div className="w-px h-4 bg-gray-300" />
            <span>500+ Happy Institutions</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
