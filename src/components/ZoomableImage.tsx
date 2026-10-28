import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Tapping twice jumps to this, which is the useful level for fabric detail. */
const DOUBLE_TAP_SCALE = 2.5;

type Props = { uri: string };

/**
 * A photo you can pinch, drag and double tap.
 *
 * It has its own GestureHandlerRootView. A React Native Modal opens in its own
 * window on Android, outside the root in App.js, so without this root the
 * gestures get no touches there and the photo cannot zoom.
 *
 * The point under your fingers (or under a double tap) stays under them while
 * the photo zooms. Dragging stops at the edge of the photo, not at the edge of
 * the screen, so the photo never slides into the black bars.
 */
export default function ZoomableImage({ uri }: Props) {
  const windowSize = useWindowDimensions();
  // The size of the area that shows the photo. The gesture positions are in
  // this area, so its centre must be exact. On Android the modal can be larger
  // than the window size, and then the zoom drifts away from the fingers.
  const [areaSize, setAreaSize] = useState<{ width: number; height: number } | null>(null);
  const { width, height } = areaSize ?? windowSize;
  // The photo's own size, so the drag limits match the part of the screen it
  // fills. Until it loads, the screen size is the best guess.
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    let isCurrent = true;
    setPhotoSize(null);
    Image.getSize(
      uri,
      (photoWidth, photoHeight) => { if (isCurrent) setPhotoSize({ width: photoWidth, height: photoHeight }); },
      () => {}, // Keep the screen-size guess.
    );
    return () => { isCurrent = false; };
  }, [uri]);
  const fit = photoSize ? Math.min(width / photoSize.width, height / photoSize.height) : 1;
  const shownWidth = photoSize ? photoSize.width * fit : width;
  const shownHeight = photoSize ? photoSize.height * fit : height;

  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  // Values when the current gesture started. A pinch takes them again each
  // time a finger touches or lifts.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // The pinch centre at the start, from the centre of the area.
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  // The pinch scale of the gesture at the start. It is not reset when a finger
  // lifts, so the zoom is measured from this value.
  const startPinchScale = useSharedValue(1);
  // The finger count at the start. 0 means that no start is taken yet.
  const startPointerCount = useSharedValue(0);

  /** How far the photo can move from the centre at this zoom, in each direction. */
  const limitX = (atScale: number) => {
    'worklet';
    return Math.max(0, (shownWidth * atScale - width) / 2);
  };
  const limitY = (atScale: number) => {
    'worklet';
    return Math.max(0, (shownHeight * atScale - height) / 2);
  };
  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(Math.max(value, -limit), limit);
  };

  const zoomOut = () => {
    'worklet';
    scale.value = withTiming(MIN_SCALE);
    x.value = withTiming(0);
    y.value = withTiming(0);
  };

  /** Moves the photo back inside its limits after a gesture. */
  const settle = () => {
    'worklet';
    if (scale.value <= MIN_SCALE) {
      zoomOut();
      return;
    }
    x.value = withTiming(clamp(x.value, limitX(scale.value)));
    y.value = withTiming(clamp(y.value, limitY(scale.value)));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      // The first update takes the start. The centre in this event can be
      // from the event before it.
      startPointerCount.value = 0;
    })
    .onUpdate(e => {
      const focalX = e.focalX - width / 2;
      const focalY = e.focalY - height / 2;
      // The pinch stays on when one of the two fingers lifts, and its centre
      // jumps to the finger that is left. Take a new start at each change, or
      // the photo jumps with the centre.
      if (e.numberOfPointers !== startPointerCount.value) {
        startPointerCount.value = e.numberOfPointers;
        startScale.value = scale.value;
        startX.value = x.value;
        startY.value = y.value;
        startFocalX.value = focalX;
        startFocalY.value = focalY;
        startPinchScale.value = e.scale;
        return;
      }
      const next = Math.min(
        Math.max(startScale.value * (e.scale / startPinchScale.value), MIN_SCALE * 0.8),
        MAX_SCALE,
      );
      // The photo point that was under the fingers at the start stays under
      // them now. A screen point is translation + scale x photo point. The
      // photo stays inside its limits during the pinch, so it does not slide
      // away and back.
      const photoX = (startFocalX.value - startX.value) / startScale.value;
      const photoY = (startFocalY.value - startY.value) / startScale.value;
      scale.value = next;
      x.value = clamp(focalX - next * photoX, limitX(next));
      y.value = clamp(focalY - next * photoY, limitY(next));
    })
    .onEnd(settle);

  // One finger drags. Two fingers belong to the pinch, which moves the photo
  // with the fingers by itself.
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(e => {
      // Dragging an unzoomed photo would only slide it away from the centre.
      if (scale.value <= MIN_SCALE) return;
      x.value = clamp(startX.value + e.translationX, limitX(scale.value));
      y.value = clamp(startY.value + e.translationY, limitY(scale.value));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(e => {
      if (scale.value > MIN_SCALE) {
        zoomOut();
        return;
      }
      // Zoom in on the tapped point: from scale 1 and no translation, the point
      // stays put when the translation is point x (1 - scale).
      const tapX = e.x - width / 2;
      const tapY = e.y - height / 2;
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      x.value = withTiming(clamp(tapX * (1 - DOUBLE_TAP_SCALE), limitX(DOUBLE_TAP_SCALE)));
      y.value = withTiming(clamp(tapY * (1 - DOUBLE_TAP_SCALE), limitY(DOUBLE_TAP_SCALE)));
    });

  // Pinch and drag run together. The first of them to start wins against the
  // double tap: a second quick tap zooms, a moving finger drags. With
  // Gesture.Exclusive(pinch and pan, doubleTap), the double tap never started.
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    width,
    height,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  } as ViewStyle));

  return (
    <GestureHandlerRootView style={s.root}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={s.fill}
          onLayout={e => {
            const area = e.nativeEvent.layout;
            if (area.width > 0 && area.height > 0) setAreaSize({ width: area.width, height: area.height });
          }}
        >
          <Animated.View style={style}>
            <Image
              source={{ uri }}
              style={{ width, height }}
              resizeMode="contain"
              accessibilityLabel="Item photo. Pinch or double tap to zoom."
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  // The modal centres its children, so the root must stretch to the full width.
  root: { flex: 1, alignSelf: 'stretch' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
