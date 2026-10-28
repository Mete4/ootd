import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, T } from '../theme';

/**
 * The badges on an item photo. Every screen uses these, so an item number or a
 * selection mark looks the same and sits in the same corner everywhere.
 */

/** The item number, in the top-left corner of the photo. */
export function ItemNumberBadge({ itemNumber }: { itemNumber: number | undefined }) {
  return (
    <View style={s.number} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text style={s.numberText}>#{itemNumber}</Text>
    </View>
  );
}

/**
 * The selection mark, in the top-right corner of the photo. An empty ring shows
 * that a tap picks the item, and a filled check shows that it is picked.
 */
export function SelectionMark({ isSelected }: { isSelected: boolean }) {
  return (
    <View
      style={[s.mark, isSelected ? s.markSelected : s.markEmpty]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {isSelected && <Ionicons name="checkmark" size={12} color={C.main} />}
    </View>
  );
}

/** Size of the selection mark. */
export const SELECTION_MARK_SIZE = 22;

const s = StyleSheet.create({
  number: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: C.photoScrim, borderRadius: R.badge, paddingHorizontal: 5, paddingVertical: 2,
  },
  numberText: { color: C.onPhoto, fontSize: T.micro, fontWeight: '700' },
  mark: {
    position: 'absolute', top: 4, right: 4,
    width: SELECTION_MARK_SIZE, height: SELECTION_MARK_SIZE, borderRadius: SELECTION_MARK_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  // A light ring on a dark plate stays visible on light and dark photos.
  markEmpty: { borderWidth: 1.5, borderColor: C.onPhoto, backgroundColor: 'rgba(0,0,0,0.3)' },
  markSelected: { backgroundColor: C.accent },
});
