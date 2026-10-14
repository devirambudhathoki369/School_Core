import SiteLayout, { getSiteProps } from "@/components/landingpage/site/Layout";
import ContactScreen from "@/components/landingpage/screens/Contact";

export const getStaticProps = getSiteProps

export default function ContactPage({ bsYear }) {
  return (
    <SiteLayout title="Contact | CentEducation" bsYear={bsYear}>
      <ContactScreen />
    </SiteLayout>
  )
}
