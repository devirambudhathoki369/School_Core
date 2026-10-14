import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDownIcon } from "@heroicons/react/24/outline"
import * as HeroIcons from "@heroicons/react/24/outline"

export default function FAQItem({ faq, index }) {
  const [isOpen, setIsOpen] = useState(false)

  const getIcon = (iconName) => {
    const iconMap = {
      clock: HeroIcons.ClockIcon,
      "shield-check": HeroIcons.ShieldCheckIcon,
      "cog-6-tooth": HeroIcons.Cog6ToothIcon,
      "life-buoy": HeroIcons.LifebuoyIcon,
      "currency-dollar": HeroIcons.CurrencyDollarIcon,
      play: HeroIcons.PlayIcon,
      wifi: HeroIcons.WifiIcon,
      "arrow-path": HeroIcons.ArrowPathIcon,
    }
    return iconMap[iconName] || HeroIcons.QuestionMarkCircleIcon
  }

  const IconComponent = getIcon(faq.icon)

  return (
    <motion.div
      className="group border border-gray-100 rounded-2xl bg-white hover:bg-gray-50 hover:shadow-xl hover:border-purple-100 transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -2 }}>
      <button
        className="w-full px-8 py-6 text-left flex items-center justify-between transition-all duration-200"
        onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center space-x-4 flex-1">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-teal-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <IconComponent className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-black transition-colors duration-200 font-serif">{faq.question}</h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="flex-shrink-0 ml-4">
          <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-purple-100 flex items-center justify-center transition-colors duration-200">
            <ChevronDownIcon className="w-4 h-4 text-black" />
          </div>
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              duration: 0.2,
              ease: "easeInOut",
              opacity: { duration: 0.15 },
            }}>
            <div className="px-8 pb-6 pl-20">
              <div className="border-l-2 border-purple-200 pl-6">
                <p className="text-black leading-relaxed font-sans">{faq.answer}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
