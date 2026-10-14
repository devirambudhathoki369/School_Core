import { motion } from "framer-motion"

export default function CEOMessageSection() {
  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mx-auto max-w-4xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl font-serif">
            A Message from Our CEO
          </h2>
        </motion.div>

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="lg:col-span-1">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80"
                alt="CEO Portrait"
                className="w-full max-w-sm mx-auto rounded-2xl shadow-xl"
              />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600/10 to-teal-600/10"></div>
            </div>
            <div className="mt-6 text-center">
              <h3 className="text-xl font-bold text-black font-serif">Nirmal Lamsal</h3>
              <p className="text-black/70 font-sans">CEO & Founder</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="lg:col-span-2">
            <div className="relative">
              <svg
                className="absolute top-0 left-0 w-8 h-8 text-purple-600 -translate-x-2 -translate-y-2"
                fill="currentColor"
                viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h4v10h-10z" />
              </svg>
              <blockquote className="text-lg leading-8 text-black/80 font-sans pl-6">
                <p className="mb-6">
                  "When I started CentEducation, I had a simple belief: technology should make education better, not more
                  complicated. Having worked in education for over 15 years, I witnessed firsthand how administrative
                  burdens were taking teachers away from what they do best - teaching."
                </p>
                <p className="mb-6">
                  "Today, I'm proud to see thousands of schools using CentEducation to streamline their operations, improve
                  communication, and create more time for meaningful education. Our platform isn't just software - it's
                  a tool for educational transformation."
                </p>
                <p>
                  "We're committed to continuously innovating and supporting educators worldwide. Together, we're
                  building the future of education management, one school at a time."
                </p>
              </blockquote>
              <div className="mt-8 flex items-center gap-4">
                <div className="w-12 h-0.5 bg-purple-600"></div>
                <p className="text-black font-semibold font-serif">Nirmal Lamsal, CEO & Founder</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
