import SiteLayout, { getSiteProps } from "@/components/landingpage/site/Layout";
import { CallBand } from "@/components/landingpage/site/ui";
import HeroSection from "@/components/landingpage/home/Hero";
import Ticker from "@/components/landingpage/home/Ticker";
import DaySection from "@/components/landingpage/home/Day";
import ModulesSection from "@/components/landingpage/home/Modules";
import { PlatformsSection, RolesSection } from "@/components/landingpage/home/Roles";
import NepalSection from "@/components/landingpage/home/Nepal";

// The page stays static. This only records the year it was built in, so the
// first paint in the browser agrees with the HTML that was sent.
export const getStaticProps = getSiteProps

export default function LandingPage({ bsYear }) {
  return (
    <SiteLayout title="CentEducation | School Management System" bsYear={bsYear}>
      <HeroSection />
      <Ticker />
      <DaySection />
      <ModulesSection />
      <RolesSection />
      <PlatformsSection />
      <NepalSection bsYear={bsYear} />
      <CallBand />
    </SiteLayout>
  )
}
