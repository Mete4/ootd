import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ClothingItem, Outfit } from '../store/useStore';
import { resolveImageUri } from '../utils/media';
import { formatDate } from '../utils/format';
import { C, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge } from './ItemPhotoBadges';

type Props = {
  outfit: Outfit;
  /** The items of the outfit that still exist. */
  items: ClothingItem[];
  numberOf: (id: string) => number;
  /** False where the screen already shows the date, as the Calendar does. */
  showsDate: boolean;
  onFavorite: () => void;
  onEdit: () => void;
  /** Leave out to hide the delete button. */
  onDelete?: () => void;
  onItem: (id: string) => void;
};

/**
 * One logged outfit: its name, date and item count, its actions, its items, and
 * its note. The Calendar, Favorites and History screens all show this card, so
 * an outfit looks the same on each of them.
 *
 * It lives at module scope on purpose. A component declared inside a screen gets
 * a new identity on every render, so React throws away each card and builds it
 * again.
 */
export default function OutfitCard({ outfit, items, numberOf, showsDate, onFavorite, onEdit, onDelete, onItem }: Props) {
  const deletedCount = outfit.itemIds.length - items.length;
  const details = [
    showsDate ? formatDate(outfit.dateWorn) : null,
    `${items.length} item${items.length === 1 ? '' : 's'}`,
    deletedCount > 0 ? `${deletedCount} deleted` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[elements.card, s.card]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          {outfit.name ? <Text style={s.name}>{outfit.name}</Text> : null}
          <Text style={s.details}>{details}</Text>
        </View>
        <View style={s.actions}>
          <TouchableOpacity
            onPress={onFavorite}
            hitSlop={hitSlopFor(ICON_SIZE.header)}
            accessibilityRole="button"
            accessibilityState={{ selected: !!outfit.isFavorite }}
            accessibilityLabel={outfit.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Ionicons name={outfit.isFavorite ? 'heart' : 'heart-outline'} size={ICON_SIZE.header} color={outfit.isFavorite ? C.danger : C.secondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onEdit} hitSlop={hitSlopFor(ICON_SIZE.header)} accessibilityRole="button" accessibilityLabel="Edit this outfit">
            <Ionicons name="create-outline" size={ICON_SIZE.header} color={C.secondary} />
          </TouchableOpacity>
          {onDelete && (
            <TouchableOpacity onPress={onDelete} hitSlop={hitSlopFor(ICON_SIZE.header)} accessibilityRole="button" accessibilityLabel="Delete this outfit">
              <Ionicons name="trash-outline" size={ICON_SIZE.header} color={C.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbnailRow}>
        {items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={elements.thumbnail}
            onPress={() => onItem(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name || item.subCategory}, item ${numberOf(item.id)}`}
          >
            {item.imageUri
              ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              : (
                <View style={s.placeholder}>
                  <Ionicons name="shirt-outline" size={18} color={C.subtle} />
                  <Text style={elements.thumbnailLabel} numberOfLines={2}>{item.subCategory}</Text>
                </View>
              )}
            <ItemNumberBadge itemNumber={numberOf(item.id)} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {outfit.note ? <Text style={s.note}>"{outfit.note}"</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  name: { color: C.primary, fontWeight: '700', fontSize: T.body },
  details: { color: C.secondary, fontSize: T.caption, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 16 },
  thumbnailRow: { gap: 8 },
  // The top padding keeps the icon clear of the item number badge.
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4, paddingTop: 22 },
  note: { color: C.secondary, fontSize: T.caption, fontStyle: 'italic', marginTop: 12 },
});
