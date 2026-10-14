import SiteLayout, { getSiteProps } from "@/components/landingpage/site/Layout";
import FeaturesScreen from "@/components/landingpage/screens/Features";

export const getStaticProps = getSiteProps

export default function FeaturesPage({ bsYear }) {
  return (
    <SiteLayout title="Features | CentEducation" bsYear={bsYear}>
      <FeaturesScreen />
    </SiteLayout>
  )
}
