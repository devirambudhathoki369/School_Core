import PrivacyPolicyDocument, {
    getPolicyProps,
} from "@/components/views/privacy/PrivacyPolicyDocument";

/**
 * `/privacy_policy/<school id>` — the same page as the query-string form.
 *
 * A Play listing's privacy policy URL is read by humans as much as by the
 * crawler, and `/privacy_policy/8` is a cleaner thing to paste into the console
 * than `/privacy_policy?schoolid=8`. Both resolve to the identical document; an
 * id that matches no school falls back to the generic policy rather than 404ing,
 * because a policy URL that fails to load fails the review.
 */

export async function getServerSideProps({ params }) {
    return getPolicyProps(params.schoolid);
}

export default PrivacyPolicyDocument;
