import PrivacyPolicyDocument, {
    getPolicyProps,
} from "@/components/views/privacy/PrivacyPolicyDocument";

/**
 * `/privacy_policy` — and `/privacy_policy?schoolid=<id>` for one school's app.
 *
 * The query-string form is the one to put on a Play listing when the school's
 * build is not the generic SchoolCore app. With no `schoolid` this serves
 * exactly the document it always has. See the component for why it is rendered
 * on the server rather than fetched on mount.
 */

export async function getServerSideProps({ query }) {
    return getPolicyProps(query.schoolid ?? query.school_id ?? query.school);
}

export default PrivacyPolicyDocument;
