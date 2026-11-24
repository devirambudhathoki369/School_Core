import { usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';

/** Asks before a screen with unsaved work closes, whichever way it closes:
 *  Back, a swipe, or a tab in the bottom bar. Returns `release`: call it just
 *  before closing the screen on purpose, after the work is saved. */
export function useLeaveGuard(unsaved: boolean, what: string) {
  // once leaving is chosen, the screen is on its way out: stop guarding it
  const [leaving, setLeaving] = useState(false);
  const disable = usePreventRemove(unsaved && !leaving, ({ repeat }) => {
    const leave = () => {
      setLeaving(true);
      repeat();
    };
    if (Platform.OS === 'web') {
      // the web build is only for trying the app out; a phone gets the dialog below
      if (window.confirm(`Leave without saving? ${what}`)) leave();
      return;
    }
    Alert.alert('Leave without saving?', what, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  });
  return () => {
    setLeaving(true);
    disable();
  };
}
