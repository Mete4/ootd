import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, TextInput, Switch, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useStore, ClothingItem } from '../store/useStore';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { resolveImageUri } from '../utils/media';
import { confirm } from '../utils/confirm';
import { showToast } from '../store/useToast';
import { openShareSheet } from '../store/useShare';
import { plural } from '../utils/format';
import { useDebounced } from '../hooks/useDebounced';
import { useWearIndex } from '../hooks/useWearIndex';
import { C, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge, SelectionMark } from '../components/ItemPhotoBadges';

export default function VacationScreen() {
  const navigation = useNavigation() as any;
  const {
    clothingItems, hierarchyCats,
    vacationMode, vacationItemIds, setVacationMode, setVacationItems, toggleVacationItem,
    collapsedCats, toggleCatCollapsed,
  } = useStore();

  const wear = useWearIndex();
  const { width } = useWindowDimensions();

  const [search, setSearch] = useState('');
  const [packedOnly, setPackedOnly] = useState(false);
  const query = useDebounced(search).trim().toLowerCase();

  const numColumns = Math.max(3, Math.floor(width / 130));
  const gutter = 12;
  const cardWidth = (width - gutter * (numColumns + 1)) / numColumns;

  const packedSet = useMemo(() => new Set(vacationItemIds), [vacationItemIds]);
  const packedCount = vacationItemIds.length;

  // You can only pack things you still own and did not archive.
  const packable = useMemo(() => clothingItems.filter(i => !i.archived), [clothingItems]);

  const matchesSearch = (i: ClothingItem) => {
    if (!query) return true;
    return (
      i.name.toLowerCase().includes(query) ||
      i.subCategory.toLowerCase().includes(query) ||
      (i.brand && i.brand.toLowerCase().includes(query)) ||
      (i.color && i.color.toLowerCase().includes(query)) ||
      String(wear.numberOf(i.id)) === query
    );
  };

  const sections = useMemo(() => {
    return hierarchyCats.map(section => {
      const items = packable
        .filter(i => i.hierarchyCategory === section && matchesSearch(i) && (!packedOnly || packedSet.has(i.id)))
        .sort((a, b) => a.subCategory.localeCompare(b.subCategory) || (a.name || '').localeCompare(b.name || ''));
      return { section, items };
    }).filter(g => g.items.length > 0);
  }, [hierarchyCats, packable, query, packedOnly, packedSet, wear]);

  const visibleCount = sections.reduce((sum, g) => sum + g.items.length, 0);

  const handleClear = () => {
    if (packedCount === 0) return;
    const before = [...vacationItemIds];
    confirm('Clear Packing List', `Remove all ${plural(packedCount)} from your packing list?`,
      () => {
        setVacationItems([]);
        setVacationMode(false);
        showToast('Packing list cleared', { label: 'Undo', onPress: () => setVacationItems(before) });
      },
      { confirmLabel: 'Clear', destructive: true });
  };

  const handleToggleMode = (on: boolean) => {
    if (on && packedCount === 0) {
      showToast('Pack a few items first, then turn on vacation mode');
      return;
    }
    setVacationMode(on);
    showToast(on ? `Vacation mode on · ${plural(packedCount)}` : 'Vacation mode off');
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
          <Text style={elements.screenTitle} accessibilityRole="header">Vacation</Text>
          <Text style={elements.screenSubtitle}>{plural(packedCount)} packed</Text>
        </View>

        {/* The same sheet as the Closet, fixed to the packing list, because
            this screen only ever publishes what you packed. */}
        <TouchableOpacity
          style={elements.headerIconButton}
          onPress={() => openShareSheet('vacation')}
          hitSlop={hitSlopFor(30)}
          accessibilityRole="button"
          accessibilityLabel={`Share your packing list, ${plural(packedCount)} packed`}
        >
          <Ionicons name="link" size={ICON_SIZE.header} color={C.secondary} />
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={[elements.card, s.toggleCard]}>
        <View style={s.toggleIcon}>
          <Ionicons name="airplane" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleLabel}>Vacation Mode</Text>
          <Text style={s.toggleSub}>
            {vacationMode
              ? 'Your outfit builder only shows packed items.'
              : 'Limit the outfit builder to what you packed.'}
          </Text>
        </View>
        <Switch
          value={vacationMode}
          onValueChange={handleToggleMode}
          trackColor={{ false: C.subtle, true: C.accent }}
          thumbColor={C.primary}
          accessibilityLabel="Vacation mode"
        />
      </View>

      {/* Search + bulk actions */}
      <View style={[elements.searchBar, s.searchBar]}>
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
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={hitSlopFor(20)} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={C.secondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.bulkRow}>
        <TouchableOpacity
          style={[elements.chip, packedOnly && elements.chipSelected]}
          onPress={() => setPackedOnly(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: packedOnly }}
          accessibilityLabel={packedOnly ? 'Showing packed items only. Show everything.' : 'Show packed items only.'}
        >
          <Ionicons name={packedOnly ? 'checkmark-circle' : 'ellipse-outline'} size={ICON_SIZE.pill} color={packedOnly ? C.main : C.secondary} />
          <Text style={[elements.chipText, packedOnly && elements.chipTextSelected]}>Packed only</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleClear}
          disabled={packedCount === 0}
          hitSlop={hitSlopFor(24)}
          accessibilityRole="button"
          accessibilityState={{ disabled: packedCount === 0 }}
          accessibilityLabel="Clear the whole packing list"
        >
          <Text style={[s.bulkAction, packedCount === 0 && { color: C.subtle }]}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {packable.length === 0 ? (
          <View style={elements.emptyState}>
            <Ionicons name="shirt-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
            <Text style={elements.emptyTitle}>Your closet is empty</Text>
            <Text style={elements.emptyText}>Add clothes to your closet before you pack for a trip.</Text>
          </View>
        ) : visibleCount === 0 ? (
          <View style={elements.emptyState}>
            <Ionicons name={query ? 'search-outline' : 'briefcase-outline'} size={ICON_SIZE.emptyState} color={C.subtle} />
            <Text style={elements.emptyTitle}>{query ? `No matches for "${search.trim()}"` : 'Nothing packed yet'}</Text>
            <Text style={elements.emptyText}>
              {query ? 'Try a name, brand, color, or an item number.' : 'Tap an item to put it in your suitcase.'}
            </Text>
            <TouchableOpacity
              style={elements.pillButton}
              onPress={() => { setSearch(''); setPackedOnly(false); }}
              accessibilityRole="button"
            >
              <Text style={elements.pillButtonText}>Show everything</Text>
            </TouchableOpacity>
          </View>
        ) : sections.map(({ section, items }) => {
          const sectionIds = items.map(i => i.id);
          const allPacked = sectionIds.every(id => packedSet.has(id));
          const packedHere = items.filter(i => packedSet.has(i.id)).length;

          // A search overrides the fold, the same as in the Closet.
          const folded = collapsedCats.includes(section) && !query && !packedOnly;

          return (
            <View key={section} style={s.section}>
              <View style={s.sectionHeader}>
                <TouchableOpacity
                  style={s.sectionTitleBtn}
                  onPress={() => toggleCatCollapsed(section)}
                  disabled={!!query || packedOnly}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !folded }}
                  accessibilityLabel={`${section}, ${packedHere} of ${items.length} packed. ${folded ? 'Closed. Open it.' : 'Open. Close it.'}`}
                >
                  <Ionicons name={folded ? 'chevron-forward' : 'chevron-down'} size={16} color={C.secondary} />
                  <Text style={elements.sectionTitle} accessibilityRole="header">
                    {section} <Text style={elements.sectionCount}>• {packedHere}/{items.length}</Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setVacationItems(
                    allPacked
                      ? vacationItemIds.filter(id => !sectionIds.includes(id))
                      : Array.from(new Set([...vacationItemIds, ...sectionIds]))
                  )}
                  hitSlop={hitSlopFor(24)}
                  accessibilityRole="button"
                  accessibilityLabel={allPacked ? `Unpack all ${section}` : `Pack all ${section}`}
                >
                  <Text style={s.sectionAction}>{allPacked ? 'Unpack all' : 'Pack all'}</Text>
                </TouchableOpacity>
              </View>

              {folded ? null : (
              <View style={[s.sectionGrid, { paddingHorizontal: gutter, gap: gutter }]}>
                {items.map(item => {
                  const packed = packedSet.has(item.id);
                  const num = wear.numberOf(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={{ width: cardWidth }}
                      activeOpacity={0.8}
                      onPress={() => toggleVacationItem(item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: packed }}
                      accessibilityLabel={`${item.name || item.subCategory}, ${item.subCategory}, item ${num}`}
                    >
                      <View style={[elements.itemPhoto, s.itemPhoto, { width: cardWidth, height: cardWidth }, packed && elements.itemPhotoSelected]}>
                        {item.imageUri
                          ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={{ width: '100%', height: '100%' }} />
                          : <Ionicons name="shirt-outline" size={ICON_SIZE.photoPlaceholder} color={C.subtle} />}
                        <ItemNumberBadge itemNumber={num} />
                        <SelectionMark isSelected={packed} />
                      </View>
                      <Text style={elements.itemTitle} numberOfLines={1}>
                        {item.name || item.subCategory}
                      </Text>
                      <Text style={elements.itemMeta} numberOfLines={1}>{item.subCategory}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Start / stop trip */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[elements.screenButton, packedCount === 0 && !vacationMode && elements.disabled]}
          onPress={() => {
            if (vacationMode) {
              handleToggleMode(false);
              return;
            }
            handleToggleMode(true);
            if (packedCount > 0) navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: packedCount === 0 && !vacationMode }}
          accessibilityLabel={vacationMode ? 'End vacation mode' : `Start vacation mode with ${plural(packedCount)}`}
        >
          <Ionicons name={vacationMode ? 'home-outline' : 'airplane'} size={18} color={C.main} />
          <Text style={elements.screenButtonText}>
            {vacationMode ? 'End Vacation Mode' : `Start Vacation Mode${packedCount > 0 ? ` (${packedCount})` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 16 },
  toggleIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTint },
  toggleLabel: { color: C.primary, fontSize: T.body, fontWeight: '700' },
  toggleSub: { color: C.secondary, fontSize: T.caption, marginTop: 2, lineHeight: 17 },
  searchBar: { marginHorizontal: 16 },
  bulkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  bulkAction: { color: C.accent, fontSize: T.caption, fontWeight: '700' },
  section: { marginTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  sectionTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flex: 1 },
  sectionAction: { color: C.accent, fontSize: T.caption, fontWeight: '700' },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  itemPhoto: { marginBottom: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.subtle, backgroundColor: C.main },
});
