import Link from 'next/link';
import { useRouter } from 'next/router';
import { portalHref, portalRole, navigatePortal } from '@/methods/portalRoutes';

export default function PortalLink({ href, onClick, children, ...props }) {
    const router = useRouter();
    const target = portalHref(href, router.asPath);
    const samePortal = typeof target === 'string' && portalRole(target)
        && portalRole(target) === portalRole(router.asPath);
    return <Link {...props} href={target} prefetch={samePortal ? false : props.prefetch}
        onClick={(event) => {
            onClick?.(event);
            // Preserve open-in-new-tab, downloads and ordinary public links.
            if (!samePortal || event.defaultPrevented || event.button !== 0
                || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
                || props.download || (props.target && props.target !== '_self')) return;
            event.preventDefault();
            void navigatePortal(router, target, { replace: props.replace });
        }}>{children}</Link>;
}
