import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, Outfit, ClothingItem } from '../store/useStore';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { confirm } from '../utils/confirm';
import { showToast } from '../store/useToast';
import { useWearIndex } from '../hooks/useWearIndex';
import { formatMonthYear } from '../utils/format';
import { C, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import OutfitCard from '../components/OutfitCard';

type Row =
  | { kind: 'month'; key: string; label: string; count: number }
  | { kind: 'outfit'; key: string; outfit: Outfit };

export default function OutfitHistoryScreen() {
  const navigation = useNavigation() as any;
  const { outfits, clothingItems, updateOutfit, deleteOutfit, addOutfit } = useStore();
  const wear = useWearIndex();

  const itemById = useMemo(() => {
    const map = new Map<string, ClothingItem>();
    clothingItems.forEach(i => map.set(i.id, i));
    return map;
  }, [clothingItems]);

  /** Sorts newest first, then adds a header each time the month changes. */
  const { rows, total } = useMemo(() => {
    const sorted = outfits
      .filter(o => o.itemIds.length > 0)
      .slice()
      .sort((a, b) => new Date(b.dateWorn).getTime() - new Date(a.dateWorn).getTime());

    const out: Row[] = [];
    let header: { kind: 'month'; key: string; label: string; count: number } | null = null;
    sorted.forEach(o => {
      const label = formatMonthYear(o.dateWorn);
      if (!header || header.label !== label) {
        header = { kind: 'month', key: `m-${label}`, label, count: 0 };
        out.push(header);
      }
      header.count += 1;
      out.push({ kind: 'outfit', key: o.id, outfit: o });
    });

    return { rows: out, total: sorted.length };
  }, [outfits]);

  const confirmDelete = (outfit: Outfit) => {
    confirm(
      'Delete Outfit',
      'Remove this outfit record?',
      () => {
        deleteOutfit(outfit.id);
        showToast('Outfit deleted', { label: 'Undo', onPress: () => addOutfit(outfit) });
      },
      { confirmLabel: 'Delete', destructive: true }
    );
  };

  const toggleFavorite = (outfit: Outfit) => {
    updateOutfit({ ...outfit, isFavorite: !outfit.isFavorite });
    showToast(outfit.isFavorite ? 'Removed from favorites' : 'Added to favorites');
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
        <View>
          <Text style={elements.screenTitle} accessibilityRole="header">Outfit History</Text>
          <Text style={elements.screenSubtitle}>{total} outfit{total === 1 ? '' : 's'} logged</Text>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item: row }) => {
          if (row.kind === 'month') {
            return (
              <Text style={[elements.sectionTitle, s.monthHeader]} accessibilityRole="header">
                {row.label} <Text style={elements.sectionCount}>• {row.count}</Text>
              </Text>
            );
          }
          const o = row.outfit;
          const items = o.itemIds
            .map(id => itemById.get(id))
            .filter((i): i is ClothingItem => !!i)
            .sort((a, b) => wear.numberOf(a.id) - wear.numberOf(b.id));

          return (
            <OutfitCard
              outfit={o}
              items={items}
              numberOf={wear.numberOf}
              showsDate
              onEdit={() => navigation.navigate('OutfitBuilder', { editingOutfit: o })}
              onDelete={() => confirmDelete(o)}
              onFavorite={() => toggleFavorite(o)}
              onItem={id => navigation.navigate('ItemDetails', { id })}
            />
          );
        }}
        ListEmptyComponent={
          <View style={elements.emptyState}>
            <Ionicons name="calendar-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
            <Text style={elements.emptyTitle}>No outfits logged yet</Text>
            <Text style={elements.emptyText}>Use the Home tab to build and log an outfit.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  monthHeader: { marginBottom: 10, marginTop: 4 },
});
