import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../store/useToast';
import { C, T, hitSlopFor } from '../theme';

const VISIBLE_MS = 4000;

/**
 * Draws the current toast above the tab bar. Mount this one time, near the root.
 */
export default function ToastHost() {
  const { message, action, nonce, hideToast } = useToast();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;

    Animated.timing(anim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) hideToast();
      });
    }, VISIBLE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `nonce` restarts the timer when a second toast replaces the first one.
  }, [message, nonce]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        s.wrap,
        {
          pointerEvents: 'box-none',
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      <View style={s.toast} accessibilityLiveRegion="polite" accessible accessibilityLabel={message}>
        <Text style={s.text} numberOfLines={2}>{message}</Text>

        {action && (
          <TouchableOpacity
            onPress={() => { action.onPress(); hideToast(); }}
            hitSlop={hitSlopFor(28)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={s.action}>{action.label}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={hideToast}
          hitSlop={hitSlopFor(20)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={18} color={C.secondary} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, bottom: 92, zIndex: 999 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.subtle,
    paddingHorizontal: 16,
    paddingVertical: 13,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: { color: C.primary, fontSize: T.footnote, flex: 1 },
  action: { color: C.accent, fontSize: T.footnote, fontWeight: '800' },
});
