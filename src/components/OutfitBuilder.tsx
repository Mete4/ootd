import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, FlatList, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ClothingItem, Outfit } from '../store/useStore';
import { checkIsDuplicateBase, getGrayOutItemIds, indexWearDates } from '../utils/outfitLogic';
import { resolveImageUri } from '../utils/media';
import { lastWornLabelFrom, formatDate } from '../utils/format';
import { useDebounced } from '../hooks/useDebounced';
import { C, DIMMED_OPACITY, R, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge, SelectionMark } from './ItemPhotoBadges';

type OutfitBuilderProps = {
  clothingItems: ClothingItem[];
  outfits: Outfit[];
  currentSelection: string[];
  setSelection: (ids: string[]) => void;
  hierarchyCats: string[];
  onLogPress: () => void;
  logBtnText?: string;
  /** When set, the grid only shows these items (vacation packing list). */
  vacationItemIds?: string[] | null;
  onExitVacation?: () => void;
};

export default function OutfitBuilder({
  clothingItems,
  outfits,
  currentSelection,
  setSelection,
  hierarchyCats,
  onLogPress,
  logBtnText = 'Log Outfit',
  vacationItemIds = null,
  onExitVacation,
}: OutfitBuilderProps) {
  const navigation = useNavigation() as any;
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const query = useDebounced(search).trim().toLowerCase();

  const TABS = useMemo(() => ['All', ...hierarchyCats], [hierarchyCats]);

  const numColumns = Math.max(3, Math.floor(width / 130));
  const cardWidth = (width - 32 - (numColumns * 8)) / numColumns;

  // Look-up tables, built one time per data change instead of per card.
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    clothingItems.forEach((i, idx) => m.set(i.id, i.itemNumber ?? idx + 1));
    return m;
  }, [clothingItems]);

  const wearDates = useMemo(() => indexWearDates(outfits), [outfits]);

  const selectedItems = useMemo(
    () => currentSelection.map(id => clothingItems.find(i => i.id === id)).filter(Boolean) as ClothingItem[],
    [currentSelection, clothingItems]
  );

  const grayOutIds = useMemo(
    () => new Set(getGrayOutItemIds(currentSelection, outfits, clothingItems)),
    [currentSelection, outfits, clothingItems]
  );

  const duplicateDate = useMemo(
    () => checkIsDuplicateBase(currentSelection, outfits, clothingItems),
    [currentSelection, outfits, clothingItems]
  );

  const filteredItems = useMemo(() => {
    const items = clothingItems.filter(i => {
      if (i.archived) return false;
      if (vacationItemIds && !vacationItemIds.includes(i.id)) return false;
      if (activeTab !== 'All' && i.hierarchyCategory !== activeTab) return false;
      if (!query) return true;

      const num = numbers.get(i.id);
      return (
        i.name.toLowerCase().includes(query) ||
        i.subCategory.toLowerCase().includes(query) ||
        (i.brand && i.brand.toLowerCase().includes(query)) ||
        (i.description && i.description.toLowerCase().includes(query)) ||
        (i.color && i.color.toLowerCase().includes(query)) ||
        (i.size && i.size.toLowerCase().includes(query)) ||
        (i.location && i.location.toLowerCase().includes(query)) ||
        String(num) === query ||
        `#${num}` === query
      );
    });

    // Push the already-worn combinations to the end.
    return items.sort((a, b) => (grayOutIds.has(a.id) ? 1 : 0) - (grayOutIds.has(b.id) ? 1 : 0));
  }, [clothingItems, activeTab, query, grayOutIds, vacationItemIds, numbers]);

  const toggleItem = (id: string) => {
    if (currentSelection.includes(id)) setSelection(currentSelection.filter(x => x !== id));
    else setSelection([...currentSelection, id]);
  };

  const renderEmpty = () => {
    if (vacationItemIds && vacationItemIds.length === 0) {
      return (
        <View style={elements.emptyState}>
          <Ionicons name="briefcase-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
          <Text style={elements.emptyTitle}>Nothing packed yet</Text>
          <Text style={elements.emptyText}>Add the clothes you brought with you from Closet, then Vacation.</Text>
        </View>
      );
    }
    if (query) {
      return (
        <View style={elements.emptyState}>
          <Ionicons name="search-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
          <Text style={elements.emptyTitle}>No matches for "{search.trim()}"</Text>
          <TouchableOpacity onPress={() => setSearch('')} style={elements.pillButton} accessibilityRole="button">
            <Text style={elements.pillButtonText}>Clear search</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={elements.emptyState}>
        <Ionicons name="shirt-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
        <Text style={elements.emptyTitle}>Nothing in {activeTab}</Text>
        <Text style={elements.emptyText}>Add items to your closet to build an outfit.</Text>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {vacationItemIds && (
        <View style={elements.accentBanner}>
          <Ionicons name="airplane" size={ICON_SIZE.pill} color={C.accent} />
          <Text style={elements.accentBannerText}>
            Vacation mode · {vacationItemIds.length} item{vacationItemIds.length === 1 ? '' : 's'} packed
          </Text>
          {onExitVacation && (
            <TouchableOpacity
              onPress={onExitVacation}
              hitSlop={hitSlopFor(24)}
              accessibilityRole="button"
              accessibilityLabel="Exit vacation mode"
            >
              <Text style={elements.accentBannerAction}>Exit</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* The outfit being built */}
      <View style={s.canvas}>
        {selectedItems.length === 0 ? (
          <View style={s.canvasEmpty}>
            <Ionicons name="shirt-outline" size={28} color={C.subtle} />
            <Text style={s.canvasHint}>Tap items below to build your outfit</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.canvasScroll}>
            {selectedItems.map(item => (
              // Holding a piece of the outfit opens it, the same as holding a
              // card in the grid below. The small X still removes it.
              <TouchableOpacity
                key={item.id}
                style={s.canvasItem}
                activeOpacity={0.8}
                onLongPress={() => navigation.navigate('ItemDetails', { id: item.id })}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityLabel={`${item.name || item.subCategory} in this outfit`}
                accessibilityHint="Touch and hold to see the item."
              >
                {item.imageUri
                  ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={s.canvasItemImg} />
                  : <View style={s.canvasItemPlaceholder}><Ionicons name="shirt-outline" size={24} color={C.secondary} /></View>
                }
                <TouchableOpacity
                  style={s.removeBtn}
                  onPress={() => toggleItem(item.id)}
                  hitSlop={hitSlopFor(22)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name || item.subCategory} from outfit`}
                >
                  <Ionicons name="close" size={14} color={C.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {duplicateDate && (
        <View style={s.warning} accessible accessibilityLabel={`You last wore this combination on ${formatDate(duplicateDate)}`}>
          <Ionicons name="warning" size={18} color={C.accentAlt} />
          <Text style={s.warningText}>
            You wore this base on <Text style={{ fontWeight: '800' }}>{formatDate(duplicateDate)}</Text>. Add a layer to make it different.
          </Text>
        </View>
      )}

      <View style={s.searchRow}>
        <View style={elements.searchBar}>
          <Ionicons name="search" size={18} color={C.secondary} />
          <TextInput
            placeholder="Search items..."
            placeholderTextColor={C.secondary}
            style={elements.searchInput}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search items"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={hitSlopFor(20)}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={C.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ height: 52 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[s.tab, activeTab === tab && s.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              accessibilityLabel={tab}
            >
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        key={numColumns}
        data={filteredItems}
        keyExtractor={item => item.id}
        numColumns={numColumns}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
        ListEmptyComponent={renderEmpty()}
        initialNumToRender={18}
        maxToRenderPerBatch={18}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item }) => {
          const isSelected = currentSelection.includes(item.id);
          const isGrayed = grayOutIds.has(item.id);
          const num = numbers.get(item.id);
          const worn = lastWornLabelFrom(wearDates.get(item.id) ?? []);

          // The photo picks the item. The text below it opens the item, and
          // the info icon shows that it does. A long press on the photo still
          // opens the item as a shortcut.
          return (
            <View style={[s.itemCard, { width: cardWidth }, isSelected && s.itemCardSelected, isGrayed && s.itemCardGrayed]}>
              <TouchableOpacity
                onPress={() => toggleItem(item.id)}
                onLongPress={() => navigation.navigate('ItemDetails', { id: item.id })}
                delayLongPress={350}
                style={s.itemImg}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  `${item.name || item.subCategory}, ${item.subCategory}, item ${num}, last worn ${worn}` +
                  (isGrayed ? ', already worn with this selection' : '')
                }
                accessibilityHint="Double tap to pick."
              >
                {item.imageUri
                  ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Ionicons name="shirt-outline" size={ICON_SIZE.photoPlaceholder} color={C.subtle} />
                }
                <ItemNumberBadge itemNumber={num} />
                <SelectionMark isSelected={isSelected} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('ItemDetails', { id: item.id })}
                style={s.itemInfo}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`See ${item.name || item.subCategory}`}
              >
                <Text style={s.itemSub} numberOfLines={2}>{item.subCategory}</Text>
                <Text style={s.itemMeta} numberOfLines={1}>{worn}</Text>
                <Ionicons name="information-circle-outline" size={12} color={C.secondary} style={s.itemInfoIcon} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <View style={s.logBtnWrap}>
        <TouchableOpacity
          style={[elements.screenButton, s.logBtn, currentSelection.length === 0 && elements.disabled]}
          onPress={onLogPress}
          disabled={currentSelection.length === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: currentSelection.length === 0 }}
          accessibilityLabel={`${logBtnText}, ${currentSelection.length} item${currentSelection.length === 1 ? '' : 's'} selected`}
        >
          <Text style={elements.screenButtonText}>
            {logBtnText}{currentSelection.length > 0 ? ` (${currentSelection.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  canvas: { height: 110, backgroundColor: C.surface, marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: C.subtle, overflow: 'hidden' },
  canvasEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  canvasHint: { color: C.secondary, fontSize: T.footnote },
  canvasScroll: { padding: 10, gap: 10, flexDirection: 'row', alignItems: 'center' },
  canvasItem: { width: 80, height: 80, backgroundColor: C.dark, borderRadius: R.thumbnail, borderWidth: 1, borderColor: C.subtle, overflow: 'hidden' },
  canvasItemImg: { width: '100%', height: '100%' },
  canvasItemPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: C.photoScrim, borderRadius: 11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  warning: { marginHorizontal: 16, marginBottom: 12, padding: 10, backgroundColor: C.accentAlt + '22', borderRadius: R.control, borderWidth: 1, borderColor: C.accentAlt, flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningText: { color: C.primary, fontSize: T.micro, flex: 1, lineHeight: 16 },
  searchRow: { paddingHorizontal: 16, marginBottom: 12 },
  tabsRow: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tab: { paddingHorizontal: 14, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  tabActive: { backgroundColor: C.elevated, borderColor: C.subtle },
  tabText: { color: C.secondary, fontWeight: '500', fontSize: T.footnote },
  tabTextActive: { color: C.primary, fontWeight: '700', fontSize: T.footnote },
  itemCard: { margin: 6, backgroundColor: C.surface, borderRadius: R.tile, borderWidth: 1, borderColor: C.subtle, overflow: 'hidden' },
  itemCardSelected: { borderColor: C.accent, borderWidth: 2 },
  itemCardGrayed: { opacity: DIMMED_OPACITY },
  itemImg: { aspectRatio: 1, backgroundColor: C.dark, alignItems: 'center', justifyContent: 'center' },
  // The button that opens the item. 44 high at least, so it is easy to hit.
  itemInfo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6, gap: 2 },
  // Out of the layout, so the text stays where it was without the icon.
  itemInfoIcon: { position: 'absolute', top: 3, right: 3 },
  itemSub: { color: C.primary, fontSize: T.micro, textAlign: 'center', lineHeight: 14 },
  itemMeta: { color: C.secondary, fontSize: T.micro, textAlign: 'center' },
  logBtnWrap: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  // The button floats over the grid, so it has a shadow.
  logBtn: { elevation: 4 },
});
