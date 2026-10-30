import { motion } from "framer-motion"
import ClientCard from "./ClientCard"
import { clients } from "../data/content"

export default function ClientsSection() {
  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}>
          <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl font-serif">
            Trusted by Leading Educational Institutions
          </h2>
          <p className="mt-6 text-lg leading-8 text-black/70 font-sans">
            Join hundreds of schools and institutions that have transformed their management with SchoolCore.
          </p>
        </motion.div>

        <div className="mt-16 overflow-x-auto">
          <div className="flex gap-6 pb-4 min-w-max">
            {clients.map((client, index) => (
              <motion.div
                key={client.id}
                className="flex-shrink-0"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}>
                <ClientCard client={client} index={index} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Trust indicators */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}>
          <p className="text-sm text-black/60 font-sans">
            Serving educational institutions across the country with reliable, secure solutions
          </p>
        </motion.div>
      </div>
    </section>
  )
}
