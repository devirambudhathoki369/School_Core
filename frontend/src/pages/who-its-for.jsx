import SiteLayout, { getSiteProps } from "@/components/landingpage/site/Layout";
import WhoScreen from "@/components/landingpage/screens/Who";

export const getStaticProps = getSiteProps

export default function WhoPage({ bsYear }) {
  return (
    <SiteLayout title="Who it is for | CentEducation" bsYear={bsYear}>
      <WhoScreen />
    </SiteLayout>
  )
}
