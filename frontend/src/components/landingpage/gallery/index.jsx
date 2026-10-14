import { motion } from "framer-motion"

const showcaseItems = [
  {
    src: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    alt: "Modern school building with students",
    title: "Modern School Management",
    description: "Streamlined operations for the digital age",
  },
  {
    src: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    alt: "Teachers collaborating with technology",
    title: "Enhanced Teacher Collaboration",
    description: "Tools that bring educators together",
  },
  {
    src: "https://images.unsplash.com/photo-1581726690015-c9861fa5057f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    alt: "Students engaged in digital learning",
    title: "Student-Centered Learning",
    description: "Technology that puts students first",
  },
  {
    src: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    alt: "School administrators using dashboard",
    title: "Smart Administration",
    description: "Data-driven decision making made simple",
  },
]

export default function GallerySection() {
  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16">
          <h2 className="text-4xl font-serif font-bold text-black mb-6">Transforming Education Worldwide</h2>
          <p className="text-xl text-black/70 max-w-3xl mx-auto font-sans">
            See how schools are revolutionizing their operations and creating better learning environments with our
            platform
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-8">
          {showcaseItems.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300">
              <img
                src={item.src || "/placeholder.svg"}
                alt={item.alt}
                className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-purple-900/80 via-purple-900/20 to-transparent">
                <div className="absolute bottom-6 left-6 right-6">
                  <h3 className="text-black font-bold text-xl mb-2 font-serif">{item.title}</h3>
                  <p className="text-black/90 text-sm font-sans">{item.description}</p>
                </div>
              </div>
              <div className="absolute inset-0 border-2 border-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center mt-16">
          <p className="text-black/60 font-sans mb-6">Ready to transform your school like these institutions?</p>
          <button className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors duration-200 font-sans">
            Start Your Transformation
          </button>
        </motion.div>
      </div>
    </section>
  )
}
