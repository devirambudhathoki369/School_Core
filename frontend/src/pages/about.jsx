import SiteLayout, { getSiteProps } from "@/components/landingpage/site/Layout";
import AboutScreen from "@/components/landingpage/screens/About";

export const getStaticProps = getSiteProps

export default function AboutPage({ bsYear }) {
  return (
    <SiteLayout title="About | SchoolCore" bsYear={bsYear}>
      <AboutScreen />
    </SiteLayout>
  )
}
