import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput, Modal, Alert,
  StyleSheet, FlatList, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useStore, ClothingItem } from '../store/useStore';
import * as ImagePicker from 'expo-image-picker';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { saveImageLocally, resolveImageUri } from '../utils/media';
import { confirm } from '../utils/confirm';
import { showToast } from '../store/useToast';
import { openShareSheet } from '../store/useShare';
import { plural } from '../utils/format';
import { useWearIndex } from '../hooks/useWearIndex';
import { useDebounced } from '../hooks/useDebounced';
import { C, R, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge, SelectionMark } from '../components/ItemPhotoBadges';

const INITIAL_FORM = {
  name: '', description: '', hierarchyCategory: 'Tops', subCategory: '', season: [] as string[],
  color: '', location: '', brand: '', price: '', size: '', link: '', imageUri: '',
};
const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

/** The item fields that mass edit can set with a text box. */
const MASS_EDIT_FIELDS = [
  { label: 'Brand', key: 'brand', placeholder: 'e.g. Uniqlo' },
  { label: 'Color', key: 'color', placeholder: 'e.g. Charcoal' },
  { label: 'Description', key: 'description', placeholder: 'e.g. Heavy cotton, boxy' },
  { label: 'Location', key: 'location', placeholder: 'e.g. Cloakroom' },
  { label: 'Price', key: 'price', placeholder: 'e.g. 40' },
] as const;

type MassEditTextField = (typeof MASS_EDIT_FIELDS)[number]['key'];

/**
 * What the mass edit sheet holds.
 *
 * Every text field is a string here, the price included, because that is what a
 * `TextInput` gives. `handleMassEdit` makes the price a number before it reaches
 * the store, the same as the single item form does.
 */
type MassEditForm = Partial<Record<MassEditTextField, string>> & { season?: string[] };

type Row =
  | { kind: 'header'; key: string; title: string; count: number; collapsed: boolean }
  | { kind: 'items'; key: string; items: ClothingItem[] };

export default function ClosetScreen() {
  const {
    clothingItems, addItem, deleteItems, updateItems, setItemsArchived,
    hierarchyCats, subCats, addCustomSubCategory,
    vacationMode, vacationItemIds, setVacationItems,
    closetSort, setClosetSort,
    collapsedCats, toggleCatCollapsed, setAllCatsCollapsed,
  } = useStore();

  const navigation = useNavigation() as any;
  const wear = useWearIndex();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Row>>(null);

  const [search, setSearch] = useState('');
  const query = useDebounced(search).trim().toLowerCase();

  const [addItemModal, setAddItemModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [isCustomSub, setIsCustomSub] = useState(false);
  const [customSub, setCustomSub] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; sub?: string }>({});

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [massEditModal, setMassEditModal] = useState(false);
  const [massEditForm, setMassEditForm] = useState<MassEditForm>({});

  const archivedCount = useMemo(() => clothingItems.filter(i => i.archived).length, [clothingItems]);

  const numColumns = Math.max(3, Math.floor(width / 130));
  const gutter = 12;
  const cardWidth = (width - gutter * (numColumns + 1)) / numColumns;

  const matches = (i: ClothingItem) => {
    if (!query) return true;
    const num = wear.numberOf(i.id);
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
  };

  /**
   * Flattens the sections into rows of cards.
   *
   * A FlatList of rows keeps the sections and the grid, and it only mounts the
   * rows on screen. The old layout put every item inside a horizontal
   * ScrollView, so a large closet mounted every card at the same time.
   */
  const { rows, resultCount } = useMemo(() => {
    const out: Row[] = [];
    let total = 0;

    hierarchyCats.forEach(section => {
      const items = clothingItems.filter(i => !i.archived && i.hierarchyCategory === section && matches(i));
      if (items.length === 0) return;

      const sorted = closetSort === 'type'
        ? [...items].sort((a, b) =>
            a.subCategory.localeCompare(b.subCategory) || (a.name || '').localeCompare(b.name || ''))
        : [...items].sort((a, b) => wear.numberOf(a.id) - wear.numberOf(b.id));

      total += sorted.length;

      // A search overrides the fold. Hiding a match the user asked for would be
      // a fault, not a feature.
      const folded = collapsedCats.includes(section) && !query;
      out.push({ kind: 'header', key: `h-${section}`, title: section, count: sorted.length, collapsed: folded });
      if (folded) return;

      for (let i = 0; i < sorted.length; i += numColumns) {
        out.push({ kind: 'items', key: `r-${section}-${i}`, items: sorted.slice(i, i + numColumns) });
      }
    });

    return { rows: out, resultCount: total };
  }, [clothingItems, hierarchyCats, closetSort, query, numColumns, wear, collapsedCats]);

  /** Categories that currently have something to show. */
  const visibleCats = useMemo(
    () => hierarchyCats.filter(c => clothingItems.some(i => !i.archived && i.hierarchyCategory === c)),
    [hierarchyCats, clothingItems]
  );
  const allFolded = visibleCats.length > 0 && visibleCats.every(c => collapsedCats.includes(c));

  /**
   * Scrolls to a category header. A folded category opens first, because
   * scrolling to a heading with nothing under it looks like a broken tap.
   */
  const jumpToCat = (cat: string) => {
    if (collapsedCats.includes(cat)) {
      toggleCatCollapsed(cat);
      // The row list rebuilds on the next render, so the index is only correct
      // after that. One frame is enough.
      requestAnimationFrame(() => {
        const idx = rows.findIndex(r => r.kind === 'header' && r.title === cat);
        if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
      });
      return;
    }
    const idx = rows.findIndex(r => r.kind === 'header' && r.title === cat);
    if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Allow photo access to add a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled) {
      const permanentUri = await saveImageLocally(result.assets[0].uri);
      setForm(f => ({ ...f, imageUri: permanentUri }));
    }
  };

  const closeAddModal = () => {
    setAddItemModal(false);
    setForm(INITIAL_FORM);
    setIsCustomSub(false);
    setCustomSub('');
    setFieldErrors({});
  };

  const handleAddItem = () => {
    const sub = isCustomSub ? customSub.trim() : form.subCategory;
    const errors: { name?: string; sub?: string } = {};
    if (!form.name.trim()) errors.name = 'Enter a name.';
    if (!sub) errors.sub = 'Pick or enter a sub-category.';

    setFieldErrors(errors);
    if (errors.name || errors.sub) return;

    if (isCustomSub && sub) addCustomSubCategory(form.hierarchyCategory, sub);

    addItem({
      ...form,
      id: generateId(),
      subCategory: sub,
      price: Number(form.price) || 0,
      originalGalleryUri: '',
      createdAt: new Date().toISOString(),
      purchaseDate: new Date().toISOString(),
    } as ClothingItem);

    const name = form.name.trim();
    closeAddModal();
    showToast(`Added "${name}"`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 0) setSelectionMode(false);
      return next;
    });
  };

  const startSelection = (id: string) => {
    setSelectionMode(true);
    setSelectedIds([id]);
  };

  const endSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    confirm(
      'Delete Selected',
      `Permanently delete ${plural(ids.length)}? Archive them instead if you want to keep the records.`,
      () => { deleteItems(ids); endSelection(); showToast(`Deleted ${plural(ids.length)}`); },
      { confirmLabel: 'Delete', destructive: true }
    );
  };

  const handleBulkArchive = () => {
    const ids = [...selectedIds];
    setItemsArchived(ids, true);
    endSelection();
    showToast(
      `Archived ${plural(ids.length)}`,
      { label: 'Undo', onPress: () => setItemsArchived(ids, false) }
    );
  };

  const handleBulkPack = () => {
    const ids = [...selectedIds];
    const before = [...vacationItemIds];
    setVacationItems(Array.from(new Set([...vacationItemIds, ...ids])));
    endSelection();
    showToast(
      `Packed ${plural(ids.length)}`,
      { label: 'Undo', onPress: () => setVacationItems(before) }
    );
  };

  const handleMassEdit = () => {
    if (Object.keys(massEditForm).length === 0) { setMassEditModal(false); return; }
    const count = selectedIds.length;

    // The store holds the price as a number. Mass edit used to write the raw
    // text from the box, which put a string in a number field.
    const { price, ...rest } = massEditForm;
    const updates: Partial<ClothingItem> = { ...rest };
    if (price !== undefined) updates.price = Number(price) || 0;

    updateItems(selectedIds, updates);
    setMassEditModal(false);
    setMassEditForm({});
    endSelection();
    showToast(`Updated ${plural(count)}`);
  };

  const renderCard = (item: ClothingItem) => {
    const isSelected = selectedIds.includes(item.id);
    const num = wear.numberOf(item.id);
    const worn = wear.lastWornLabel(item.id);
    const packed = vacationItemIds.includes(item.id);

    return (
      <TouchableOpacity
        key={item.id}
        style={{ width: cardWidth }}
        onPress={() => (selectionMode ? toggleSelect(item.id) : navigation.navigate('ItemDetails', { id: item.id }))}
        onLongPress={() => !selectionMode && startSelection(item.id)}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={
          `${item.name || item.subCategory}, ${item.subCategory}, item ${num}, last worn ${worn}` +
          (packed ? ', packed for vacation' : '') +
          (selectionMode ? (isSelected ? ', selected' : ', not selected') : '')
        }
      >
        <View style={[elements.itemPhoto, s.itemPhoto, { width: cardWidth, height: cardWidth }, isSelected && elements.itemPhotoSelected]}>
          {item.imageUri
            ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={{ width: '100%', height: '100%' }} />
            : <Ionicons name="shirt-outline" size={ICON_SIZE.photoPlaceholder} color={C.subtle} />}

          <ItemNumberBadge itemNumber={num} />

          {packed && !selectionMode && (
            <View style={s.packedBadge}><Ionicons name="airplane" size={11} color={C.main} /></View>
          )}

          {selectionMode && <SelectionMark isSelected={isSelected} />}
        </View>

        <Text style={elements.itemTitle} numberOfLines={1}>{item.name || item.subCategory}</Text>
        <Text style={elements.itemMeta} numberOfLines={1}>{worn}</Text>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (clothingItems.length === 0) {
      return (
        <View style={elements.emptyState}>
          <Ionicons name="shirt-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
          <Text style={elements.emptyTitle}>Your closet is empty</Text>
          <Text style={elements.emptyText}>Tap the plus button to add an item, or import your wardrobe from Settings.</Text>
        </View>
      );
    }
    if (query) {
      return (
        <View style={elements.emptyState}>
          <Ionicons name="search-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
          <Text style={elements.emptyTitle}>No matches for "{search.trim()}"</Text>
          <Text style={elements.emptyText}>Try a name, brand, color, sub-category, or an item number.</Text>
          <TouchableOpacity style={elements.pillButton} onPress={() => setSearch('')} accessibilityRole="button">
            <Text style={elements.pillButtonText}>Clear search</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={elements.emptyState}>
        <Ionicons name="archive-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
        <Text style={elements.emptyTitle}>Everything is archived</Text>
        <TouchableOpacity style={elements.pillButton} onPress={() => navigation.navigate('Archived')} accessibilityRole="button">
          <Text style={elements.pillButtonText}>Open archive</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={[elements.screenHeader, s.headerRow]}>
        <Text style={elements.screenTitle}>{selectionMode ? `${selectedIds.length} Selected` : 'Closet'}</Text>

        {selectionMode ? (
          <TouchableOpacity onPress={endSelection} hitSlop={hitSlopFor(30)} accessibilityRole="button" accessibilityLabel="Cancel selection">
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.headerActions}>
            <TouchableOpacity
              style={elements.pillButton}
              onPress={() => setClosetSort(closetSort === 'type' ? 'index' : 'type')}
              accessibilityRole="button"
              accessibilityLabel={closetSort === 'type'
                ? 'Sorted by type. Switch to item number order.'
                : 'Sorted by item number. Switch to type order.'}
            >
              <Ionicons name="swap-vertical" size={ICON_SIZE.pill} color={C.accent} />
              <Text style={elements.pillButtonText}>{closetSort === 'type' ? 'A–Z' : '#'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={elements.headerIconButton}
              onPress={() => navigation.navigate('Vacation')}
              hitSlop={hitSlopFor(30)}
              accessibilityRole="button"
              accessibilityLabel={vacationMode
                ? `Vacation mode on, ${plural(vacationItemIds.length)} packed. Open vacation.`
                : 'Open vacation packing list'}
            >
              <Ionicons name={vacationMode ? 'airplane' : 'airplane-outline'} size={ICON_SIZE.header} color={vacationMode ? C.accent : C.secondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={elements.headerIconButton}
              onPress={() => navigation.navigate('Archived')}
              hitSlop={hitSlopFor(30)}
              accessibilityRole="button"
              accessibilityLabel={`Open archive, ${plural(archivedCount)}`}
            >
              <Ionicons name="archive-outline" size={ICON_SIZE.header} color={C.secondary} />
            </TouchableOpacity>

            {/* Sharing belongs with the closet, not in Settings: this is the
                screen that shows what the link publishes. The sheet opens on
                the link that matches the mode, and can switch inside. */}
            <TouchableOpacity
              style={elements.headerIconButton}
              onPress={() => openShareSheet(vacationMode ? 'vacation' : 'full')}
              hitSlop={hitSlopFor(30)}
              accessibilityRole="button"
              accessibilityLabel={vacationMode ? 'Share your packing list' : 'Share your closet'}
            >
              <Ionicons name="link" size={ICON_SIZE.header} color={C.secondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {vacationMode && !selectionMode && (
        <TouchableOpacity
          style={elements.accentBanner}
          onPress={() => navigation.navigate('Vacation')}
          accessibilityRole="button"
          accessibilityLabel={`Vacation mode is on with ${plural(vacationItemIds.length)} packed. Open vacation.`}
        >
          <Ionicons name="airplane" size={ICON_SIZE.pill} color={C.accent} />
          <Text style={elements.accentBannerText}>
            Vacation mode · your outfit builder shows {vacationItemIds.length} packed item{vacationItemIds.length === 1 ? '' : 's'}
          </Text>
          <Ionicons name="chevron-forward" size={ICON_SIZE.pill} color={C.secondary} />
        </TouchableOpacity>
      )}

      <View style={s.searchWrap}>
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

        {selectionMode && (
          <View style={s.bulkActions}>
            <TouchableOpacity onPress={() => setMassEditModal(true)} hitSlop={hitSlopFor(28)} accessibilityRole="button" accessibilityLabel={`Edit ${plural(selectedIds.length)}`}>
              <Ionicons name="create-outline" size={24} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkPack} hitSlop={hitSlopFor(28)} accessibilityRole="button" accessibilityLabel={`Pack ${plural(selectedIds.length)} for vacation`}>
              <Ionicons name="airplane-outline" size={24} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkArchive} hitSlop={hitSlopFor(28)} accessibilityRole="button" accessibilityLabel={`Archive ${plural(selectedIds.length)}`}>
              <Ionicons name="archive-outline" size={24} color={C.secondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkDelete} hitSlop={hitSlopFor(28)} accessibilityRole="button" accessibilityLabel={`Delete ${plural(selectedIds.length)}`}>
              <Ionicons name="trash-outline" size={24} color={C.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {query.length > 0 && resultCount > 0 && (
        <Text style={s.resultCount}>{resultCount} result{resultCount === 1 ? '' : 's'}</Text>
      )}

      {/* Jump straight to a category instead of scrolling past every top. */}
      {!selectionMode && !query && visibleCats.length > 1 && (
        <View style={s.jumpBarRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.jumpBar}>
            {visibleCats.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.jumpChip, collapsedCats.includes(cat) && s.jumpChipFolded]}
                onPress={() => jumpToCat(cat)}
                accessibilityRole="button"
                accessibilityLabel={`Jump to ${cat}`}
              >
                <Text style={[s.jumpChipText, collapsedCats.includes(cat) && s.jumpChipTextFolded]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={s.foldAllBtn}
            onPress={() => setAllCatsCollapsed(allFolded ? [] : visibleCats)}
            hitSlop={hitSlopFor(30)}
            accessibilityRole="button"
            accessibilityLabel={allFolded ? 'Open every category' : 'Close every category'}
          >
            <Ionicons name={allFolded ? 'chevron-expand-outline' : 'chevron-collapse-outline'} size={18} color={C.accent} />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={r => r.key}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListEmptyComponent={renderEmpty()}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        // Rows vary in height, so the list cannot always measure a distant
        // index on the first try. Nudge toward it, then retry once.
        onScrollToIndexFailed={info => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 });
          }, 120);
        }}
        renderItem={({ item: row }) =>
          row.kind === 'header' ? (
            <TouchableOpacity
              style={s.sectionHeaderRow}
              onPress={() => toggleCatCollapsed(row.title)}
              disabled={!!query}
              accessibilityRole="button"
              accessibilityState={{ expanded: !row.collapsed }}
              accessibilityLabel={`${row.title}, ${plural(row.count)}. ${row.collapsed ? 'Closed. Open it.' : 'Open. Close it.'}`}
            >
              <Ionicons
                name={row.collapsed ? 'chevron-forward' : 'chevron-down'}
                size={16}
                color={C.secondary}
              />
              <Text style={s.sectionTitle} accessibilityRole="header">
                {row.title} <Text style={elements.sectionCount}>• {row.count}</Text>
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.gridRow, { paddingHorizontal: gutter, gap: gutter }]}>
              {row.items.map(renderCard)}
            </View>
          )
        }
      />

      {!selectionMode && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => setAddItemModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Add a new item"
        >
          <Ionicons name="add" size={32} color={C.main} />
        </TouchableOpacity>
      )}

      {/* Add item */}
      <Modal visible={addItemModal} animationType="slide" transparent onRequestClose={closeAddModal}>
        <View style={elements.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeAddModal} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[elements.sheet, { maxHeight: '88%' }]}>
              <View style={elements.grabber} />
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={elements.sheetHeading}>
                  <Text style={elements.sheetTitle}>Add New Item</Text>
                </View>

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Item Photo</Text>
                  <TouchableOpacity style={s.photoPicker} onPress={pickImage} accessibilityRole="button" accessibilityLabel="Add a photo">
                    {form.imageUri ? (
                      <Image source={{ uri: resolveImageUri(form.imageUri) }} style={s.photoPreview} />
                    ) : (
                      <View style={s.photoPlaceholder}>
                        <Ionicons name="camera-outline" size={32} color={C.secondary} />
                        <Text style={s.photoPlaceholderText}>Add Photo</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {form.imageUri !== '' && (
                    <TouchableOpacity
                      style={s.photoRemove}
                      onPress={() => setForm(f => ({ ...f, imageUri: '' }))}
                      hitSlop={hitSlopFor(28)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="close-circle" size={26} color={C.danger} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Name *</Text>
                  <TextInput
                    style={[elements.textInput, fieldErrors.name && s.formInputError]}
                    placeholder="e.g. Grey Dress Pants"
                    placeholderTextColor={C.secondary}
                    value={form.name ?? ''}
                    onChangeText={v => { setForm(f => ({ ...f, name: v })); if (fieldErrors.name) setFieldErrors(e => ({ ...e, name: undefined })); }}
                    accessibilityLabel="Name"
                  />
                  {fieldErrors.name && <Text style={s.formError}>{fieldErrors.name}</Text>}
                </View>

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Description</Text>
                  <TextInput
                    style={[elements.textInput, s.formInputMultiline]}
                    placeholder="Fabric, fit, how it feels, what it goes with"
                    placeholderTextColor={C.secondary}
                    value={form.description ?? ''}
                    onChangeText={v => setForm(f => ({ ...f, description: v }))}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    accessibilityLabel="Description"
                  />
                  <Text style={s.formHint}>Search looks in here too.</Text>
                </View>

                {[
                  { label: 'Brand', key: 'brand', placeholder: 'e.g. Uniqlo' },
                  { label: 'Color', key: 'color', placeholder: 'e.g. Charcoal Grey' },
                  { label: 'Size', key: 'size', placeholder: 'e.g. M, L, 32x30' },
                  { label: 'Price', key: 'price', placeholder: 'e.g. 49.99' },
                  { label: 'Location', key: 'location', placeholder: 'e.g. Cloakroom' },
                  { label: 'Link', key: 'link', placeholder: 'https://' },
                ].map(field => (
                  <View key={field.key} style={s.formField}>
                    <Text style={elements.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={elements.textInput}
                      placeholder={field.placeholder}
                      placeholderTextColor={C.secondary}
                      value={(form as any)[field.key] ?? ''}
                      onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
                      keyboardType={field.key === 'price' ? 'decimal-pad' : field.key === 'link' ? 'url' : 'default'}
                      autoCapitalize={field.key === 'link' ? 'none' : 'sentences'}
                      autoCorrect={field.key !== 'link'}
                      accessibilityLabel={field.label}
                    />
                  </View>
                ))}

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                    {hierarchyCats.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setForm(f => ({ ...f, hierarchyCategory: c, subCategory: '' }))}
                        style={[elements.chip, form.hierarchyCategory === c && elements.chipSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: form.hierarchyCategory === c }}
                        accessibilityLabel={c}
                      >
                        <Text style={[elements.chipText, form.hierarchyCategory === c && elements.chipTextSelected]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Sub-Category *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                    {(subCats[form.hierarchyCategory] || []).map(c => {
                      const active = !isCustomSub && form.subCategory === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          onPress={() => {
                            setForm(f => ({ ...f, subCategory: c }));
                            setIsCustomSub(false);
                            setFieldErrors(e => ({ ...e, sub: undefined }));
                          }}
                          style={[elements.chip, active && elements.chipSelected]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={c}
                        >
                          <Text style={[elements.chipText, active && elements.chipTextSelected]}>{c}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => { setIsCustomSub(true); setFieldErrors(e => ({ ...e, sub: undefined })); }}
                      style={[elements.chip, isCustomSub && elements.chipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isCustomSub }}
                      accessibilityLabel="Add a custom sub-category"
                    >
                      <Text style={[elements.chipText, isCustomSub && elements.chipTextSelected]}>+ Custom</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {isCustomSub && (
                    <TextInput
                      style={[elements.textInput, { marginTop: 8 }]}
                      placeholder="Enter custom sub-category..."
                      placeholderTextColor={C.secondary}
                      value={customSub}
                      onChangeText={setCustomSub}
                      accessibilityLabel="Custom sub-category"
                    />
                  )}
                  {fieldErrors.sub && <Text style={s.formError}>{fieldErrors.sub}</Text>}
                </View>

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Season</Text>
                  <View style={s.wrapRow}>
                    {SEASONS.map(season => {
                      const active = form.season.includes(season);
                      return (
                        <TouchableOpacity
                          key={season}
                          onPress={() => setForm(f => ({
                            ...f,
                            season: active ? f.season.filter(x => x !== season) : [...f.season, season],
                          }))}
                          style={[elements.chip, active && elements.chipSelected]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={season}
                        >
                          <Text style={[elements.chipText, active && elements.chipTextSelected]}>{season}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={elements.buttonRow}>
                  <TouchableOpacity style={elements.outlineButton} onPress={closeAddModal} accessibilityRole="button">
                    <Text style={elements.outlineButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={elements.filledButton} onPress={handleAddItem} accessibilityRole="button">
                    <Text style={elements.filledButtonText}>Add to Closet</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Mass edit */}
      <Modal visible={massEditModal} animationType="slide" transparent onRequestClose={() => setMassEditModal(false)}>
        <View style={elements.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setMassEditModal(false); setMassEditForm({}); }} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[elements.sheet, { maxHeight: '80%' }]}>
              <View style={elements.grabber} />
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={elements.sheetHeading}>
                  <Text style={elements.sheetTitle}>Mass Edit ({plural(selectedIds.length)})</Text>
                  <Text style={elements.sheetHint}>Values you enter apply to every selected item. Leave a field blank to keep it.</Text>
                </View>

                {MASS_EDIT_FIELDS.map(field => (
                  <View key={field.key} style={s.formField}>
                    <Text style={elements.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={elements.textInput}
                      placeholder={field.placeholder}
                      placeholderTextColor={C.secondary}
                      value={massEditForm[field.key] ?? ''}
                      onChangeText={v => setMassEditForm(f => ({ ...f, [field.key]: v }))}
                      keyboardType={field.key === 'price' ? 'decimal-pad' : 'default'}
                      accessibilityLabel={field.label}
                    />
                  </View>
                ))}

                <View style={s.formField}>
                  <Text style={elements.fieldLabel}>Season</Text>
                  <View style={s.wrapRow}>
                    {SEASONS.map(season => {
                      const active = massEditForm.season?.includes(season);
                      return (
                        <TouchableOpacity
                          key={season}
                          onPress={() => setMassEditForm(f => ({
                            ...f,
                            season: active
                              ? (f.season ?? []).filter(x => x !== season)
                              : [...(f.season ?? []), season],
                          }))}
                          style={[elements.chip, active && elements.chipSelected]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: !!active }}
                          accessibilityLabel={season}
                        >
                          <Text style={[elements.chipText, active && elements.chipTextSelected]}>{season}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={elements.buttonRow}>
                  <TouchableOpacity style={elements.outlineButton} onPress={() => { setMassEditModal(false); setMassEditForm({}); }} accessibilityRole="button">
                    <Text style={elements.outlineButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={elements.filledButton} onPress={handleMassEdit} accessibilityRole="button">
                    <Text style={elements.filledButtonText}>Apply Changes</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  headerRow: { justifyContent: 'space-between' },
  cancelText: { color: C.accent, fontWeight: '700', fontSize: T.body },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 14, marginBottom: 12 },
  searchBar: { flex: 1 },
  bulkActions: { flexDirection: 'row', gap: 18 },
  resultCount: { color: C.secondary, fontSize: T.caption, paddingHorizontal: 16, paddingBottom: 8 },
  // 48 tall so the whole heading is a comfortable target, not just the chevron.
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, minHeight: 48 },
  sectionTitle: { ...elements.sectionTitle, paddingVertical: 10 },

  jumpBarRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 10, gap: 4 },
  jumpBar: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  jumpChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.subtle },
  jumpChipFolded: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  jumpChipText: { color: C.primary, fontSize: T.caption, fontWeight: '600' },
  jumpChipTextFolded: { color: C.secondary, fontWeight: '400' },
  foldAllBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gridRow: { flexDirection: 'row', marginBottom: 14 },
  itemPhoto: { marginBottom: 8 },
  packedBadge: { position: 'absolute', bottom: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, backgroundColor: C.accent, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  formField: { ...elements.field, position: 'relative' },
  formInputError: { borderColor: C.danger },
  formInputMultiline: { minHeight: 82, paddingTop: 13 },
  formHint: { color: C.secondary, fontSize: T.caption, marginTop: 6 },
  formError: { color: C.danger, fontSize: T.caption, marginTop: 6 },
  chipRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  wrapRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoPicker: { width: '100%', height: 200, backgroundColor: C.main, borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, borderColor: C.subtle, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', gap: 8 },
  photoPlaceholderText: { color: C.secondary, fontSize: T.caption, fontWeight: '600' },
  photoRemove: { position: 'absolute', top: 34, right: 8, backgroundColor: C.photoScrim, borderRadius: 14 },
});
