import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../store/useStore';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { resolveImageUri } from '../utils/media';
import { confirm } from '../utils/confirm';
import { showToast } from '../store/useToast';
import { plural } from '../utils/format';
import { useWearIndex } from '../hooks/useWearIndex';
import { C, R, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge } from '../components/ItemPhotoBadges';

export default function ArchivedScreen() {
  const navigation = useNavigation() as any;
  const { clothingItems, setItemsArchived, deleteItem, hierarchyCats } = useStore();
  const wear = useWearIndex();
  const { width } = useWindowDimensions();

  const numColumns = Math.max(2, Math.floor(width / 160));
  const gutter = 12;
  const cardWidth = (width - gutter * (numColumns + 1)) / numColumns;

  const archived = useMemo(() => clothingItems.filter(i => i.archived), [clothingItems]);

  /** Restore is easy to reverse, so a toast with Undo beats a dialog. */
  const restore = (id: string, label: string) => {
    setItemsArchived([id], false);
    showToast(`Restored "${label}"`, { label: 'Undo', onPress: () => setItemsArchived([id], true) });
  };

  const restoreAll = () => {
    const ids = archived.map(i => i.id);
    setItemsArchived(ids, false);
    showToast(`Restored ${plural(ids.length)}`, { label: 'Undo', onPress: () => setItemsArchived(ids, true) });
  };

  const remove = (id: string, label: string) => {
    confirm('Delete Item', `Permanently delete "${label}"? You cannot undo this.`,
      () => { deleteItem(id); showToast(`Deleted "${label}"`); },
      { confirmLabel: 'Delete', destructive: true });
  };

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={elements.screenHeader}>
        <TouchableOpacity
          style={elements.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={hitSlopFor(40)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={ICON_SIZE.back} color={C.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={elements.screenTitle} accessibilityRole="header">Archived</Text>
          <Text style={elements.screenSubtitle}>{plural(archived.length)} tucked away</Text>
        </View>
        {archived.length > 1 && (
          <TouchableOpacity
            style={elements.pillButton}
            onPress={restoreAll}
            accessibilityRole="button"
            accessibilityLabel={`Restore all ${plural(archived.length)}`}
          >
            <Text style={elements.pillButtonText}>Restore all</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {archived.length === 0 ? (
          <View style={elements.emptyState}>
            <Ionicons name="archive-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
            <Text style={elements.emptyTitle}>Nothing archived</Text>
            <Text style={elements.emptyText}>
              Archive worn-out or dirty clothes to keep them on record without clutter in your closet.
              You can archive an item from its details page, or with a long press in the closet.
            </Text>
          </View>
        ) : (
          hierarchyCats.map(section => {
            const items = archived
              .filter(i => i.hierarchyCategory === section)
              .sort((a, b) => a.subCategory.localeCompare(b.subCategory) || (a.name || '').localeCompare(b.name || ''));
            if (items.length === 0) return null;
            return (
              <View key={section} style={s.section}>
                <Text style={[elements.sectionTitle, s.sectionTitle]} accessibilityRole="header">
                  {section} <Text style={elements.sectionCount}>• {items.length}</Text>
                </Text>
                <View style={[s.sectionGrid, { paddingHorizontal: gutter, gap: gutter }]}>
                  {items.map(item => {
                    const label = item.name || item.subCategory;
                    const num = wear.numberOf(item.id);
                    return (
                      <View key={item.id} style={{ width: cardWidth }}>
                        <TouchableOpacity
                          style={[elements.itemPhoto, s.itemPhoto, { width: cardWidth, height: cardWidth }]}
                          activeOpacity={0.85}
                          onPress={() => navigation.navigate('ItemDetails', { id: item.id })}
                          accessibilityRole="button"
                          accessibilityLabel={`${label}, ${item.subCategory}, item ${num}, archived`}
                        >
                          {item.imageUri
                            ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={{ width: '100%', height: '100%' }} />
                            : <Ionicons name="shirt-outline" size={ICON_SIZE.photoPlaceholder} color={C.subtle} />}
                          <ItemNumberBadge itemNumber={num} />
                        </TouchableOpacity>
                        <Text style={elements.itemTitle} numberOfLines={1}>{label}</Text>
                        <Text style={elements.itemMeta} numberOfLines={1}>{item.subCategory}</Text>
                        <View style={s.cardActions}>
                          <TouchableOpacity
                            style={s.restoreBtn}
                            onPress={() => restore(item.id, label)}
                            accessibilityRole="button"
                            accessibilityLabel={`Restore ${label} to the closet`}
                          >
                            <Ionicons name="refresh-outline" size={ICON_SIZE.pill} color={C.accent} />
                            <Text style={s.restoreText}>Restore</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.trashBtn}
                            onPress={() => remove(item.id, label)}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${label} forever`}
                          >
                            <Ionicons name="trash-outline" size={ICON_SIZE.pill} color={C.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  section: { marginBottom: 24 },
  sectionTitle: { paddingHorizontal: 16, marginBottom: 12 },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Dimmed a little, so an archived item looks put away.
  itemPhoto: { marginBottom: 8, opacity: 0.75 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  restoreBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, borderRadius: R.control, borderWidth: 1, borderColor: C.accent },
  restoreText: { color: C.accent, fontWeight: '700', fontSize: T.caption },
  trashBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.control, borderWidth: 1, borderColor: C.danger },
});
