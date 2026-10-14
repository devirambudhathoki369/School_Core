import { useRef } from "react";

/**
 * A dialog that closes on a click on ITS OWN backdrop, and on nothing else.
 *
 * Material Tailwind counts every click that is not inside the panel as
 * "outside". That also takes in things drawn outside it on purpose: a picker's
 * list (it lives in a portal) and a confirmation raised from inside the dialog
 * — so choosing an option, or answering "Change password?", would close the
 * form underneath. Here only the dimmed area around the panel counts.
 *
 *     const { panelRef, outsidePress } = useBackdropDismiss();
 *     <Dialog ref={panelRef} dismiss={{ outsidePress }} ...>
 */
const useBackdropDismiss = () => {
    const panelRef = useRef(null);
    const outsidePress = (event) => event.target === panelRef.current?.parentElement;
    return { panelRef, outsidePress };
}

export default useBackdropDismiss;
