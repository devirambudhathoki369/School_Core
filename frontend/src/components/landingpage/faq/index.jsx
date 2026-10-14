import { motion } from "framer-motion"
import FAQItem from "./FAQItem"
import { faqs } from "../data/content"

export default function FAQSection() {
  const leftColumnFAQs = faqs.filter((_, index) => index % 2 === 0)
  const rightColumnFAQs = faqs.filter((_, index) => index % 2 === 1)

  return (
    <section id="faqs" className="py-24 sm:py-32 bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-600 mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-4xl font-bold font-serif text-black sm:text-5xl">Frequently Asked Questions</h2>
          <p className="mt-6 text-lg leading-8 text-black font-sans">
            Get instant answers to common questions about CentEducation and discover how it can transform your institution.
          </p>
        </motion.div>

        <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}>
            {leftColumnFAQs.map((faq, index) => (
              <FAQItem key={faq.id} faq={faq} index={index * 2} />
            ))}
          </motion.div>

          {/* Right Column */}
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}>
            {rightColumnFAQs.map((faq, index) => (
              <FAQItem key={faq.id} faq={faq} index={index * 2 + 1} />
            ))}
          </motion.div>
        </div>

        {/* Contact CTA */}
        <motion.div
          className="mt-20 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}>
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
            <h3 className="text-xl font-semibold text-black mb-3 font-serif">Still have questions?</h3>
            <p className="text-black mb-6 font-sans">Our expert team is ready to help you succeed!</p>
            <a
              href="#contact"
              className="inline-flex items-center rounded-2xl bg-purple-600 hover:bg-purple-700 px-8 py-4 text-sm font-semibold text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 font-sans">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Contact Our Team
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
