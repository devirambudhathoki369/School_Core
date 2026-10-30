import SiteLayout, { getSiteProps } from "@/components/landingpage/site/Layout";
import WhyScreen from "@/components/landingpage/screens/Why";

export const getStaticProps = getSiteProps

export default function WhyPage({ bsYear }) {
  return (
    <SiteLayout title="Why SchoolCore" bsYear={bsYear}>
      <WhyScreen bsYear={bsYear} />
    </SiteLayout>
  )
}
