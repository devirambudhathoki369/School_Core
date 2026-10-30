// The website's menu. Each entry is a page of its own.
export const navigationItems = [
    { name: "Features", href: "/features" },
    { name: "Who it is for", href: "/who-its-for" },
    { name: "Why SchoolCore", href: "/why-centeducation" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
]

// The portals a visitor can sign in to. These are full page loads into
// the portal, not pages of the website.
export const signInLinks = [
    { name: "School admin", hint: "The office, accounts and setup", href: "/admin" },
    { name: "Staff", hint: "Teachers and other staff", href: "/staff" },
    { name: "Student", hint: "Students and their parents", href: "/student" },
    { name: "Canteen", hint: "The canteen counter and its billing", href: "/canteen" },
]

export const footerLinks = {
    product: [
        { name: "Features", href: "/features" },
        { name: "Who it is for", href: "/who-its-for" },
        { name: "Why SchoolCore", href: "/why-centeducation" },
    ],
    company: [
        { name: "About", href: "/about" },
        { name: "Contact", href: "/contact" },
        { name: "Help desk", href: "/support", outside: true },
        { name: "Privacy Policy", href: "/privacy_policy", outside: true },
    ],
}

export const companyInfo = {
    name: "SchoolCore",
    tagline: "Complete School Management System",
    description: "Transform your educational institution with our comprehensive management platform",
}
