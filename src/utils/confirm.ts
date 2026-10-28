import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 *
 * react-native-web has no real Alert implementation, so an Alert.alert button
 * callback never fires on web — any action gated behind one silently does
 * nothing. This mirrors the Platform.OS === 'web' pattern already used in
 * ItemDetailsScreen/CalendarScreen so confirmations work everywhere.
 */
export const confirm = (
  title: string,
  message: string,
  onConfirm: () => void,
  options?: { confirmLabel?: string; destructive?: boolean }
) => {
  const confirmLabel = options?.confirmLabel ?? 'OK';

  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: options?.destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
};
