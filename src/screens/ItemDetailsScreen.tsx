import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Modal, Dimensions, PanResponder, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, ClothingItem } from '../store/useStore';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { resolveImageUri } from '../utils/media';
import { useWearIndex } from '../hooks/useWearIndex';
import { formatPrice, formatDateWithWeekday } from '../utils/format';
import { showToast } from '../store/useToast';
import { confirm } from '../utils/confirm';
import ZoomableImage from '../components/ZoomableImage';
import { C, R, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';

const { width: W, height: H } = Dimensions.get('window');

const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];

type FieldProps = {
  label: string;
  editing: boolean;
  value: string;
  display?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
};

/**
 * One label-and-value row.
 *
 * This lives at module scope on purpose. It used to be declared inside the
 * screen, so each render created a new component type. React then unmounted and
 * remounted the TextInput on every keystroke, and the field lost the keyboard.
 */
const Field = ({ label, editing, value, display, onChange, placeholder, numeric }: FieldProps) => (
  <View style={s.fieldRow}>
    <Text style={elements.overline}>{label}</Text>
    {editing ? (
      <TextInput
        style={s.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || label}
        placeholderTextColor={C.secondary}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        accessibilityLabel={label}
      />
    ) : (
      <Text style={s.fieldValue}>{display || value || '—'}</Text>
    )}
  </View>
);

export default function ItemDetailsScreen() {
  const { clothingItems, outfits, updateItem, deleteItem, setItemsArchived, hierarchyCats, subCats } = useStore();
  const route = useRoute();
  const navigation = useNavigation() as any;
  const wear = useWearIndex();

  const itemId = (route.params as any)?.id;

  // The id of the item on screen. A swipe changes it, so it can differ from the route.
  const [currentId, setCurrentId] = useState<string>(itemId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ClothingItem>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [subError, setSubError] = useState('');

  // Swiping moves between the items of the same category and the same archive state.
  const sectionItems = useMemo(() => {
    const current = clothingItems.find(i => i.id === currentId);
    if (!current) return [];
    return clothingItems.filter(
      i => i.hierarchyCategory === current.hierarchyCategory && !!i.archived === !!current.archived
    );
  }, [clothingItems, currentId]);

  // Derive the position from the id. An edit that moves the item to another
  // category rebuilds the section, and the counter stays correct.
  const activeIndex = Math.max(0, sectionItems.findIndex(i => i.id === currentId));
  const item = sectionItems[activeIndex] || clothingItems.find(i => i.id === currentId);

  // Reset only when the route target changes, not on every closet change.
  useEffect(() => {
    setCurrentId(itemId);
    setEditing(false);
    setFullscreen(false);
    setSubError('');
    setForm(clothingItems.find(i => i.id === itemId) || {});
  }, [itemId]);

  const setField = useCallback(
    (key: keyof ClothingItem) => (v: string) => setForm(f => ({ ...f, [key]: v })),
    []
  );

  const goToItem = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= sectionItems.length) return;
    setCurrentId(sectionItems[nextIndex].id);
    setForm(sectionItems[nextIndex]);
    setEditing(false);
    setFullscreen(false);
    setSubError('');
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      !editing && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -50) goToItem(activeIndex + 1);
      else if (g.dx > 50) goToItem(activeIndex - 1);
    },
  }), [activeIndex, sectionItems, editing]);

  if (!item) {
    return (
      <SafeAreaView edges={['top']} style={s.screen}>
        <View style={s.notFound}>
          <Ionicons name="help-circle-outline" size={48} color={C.subtle} />
          <Text style={s.notFoundText}>This item is no longer in your closet.</Text>
          <TouchableOpacity style={elements.pillButton} onPress={() => navigation.goBack()}>
            <Text style={elements.pillButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    // A new category clears the sub-category. The closet groups by sub-category,
    // so an empty one would put the item in a group with no name.
    const sub = String(form.subCategory ?? item.subCategory ?? '').trim();
    if (!sub) {
      setSubError('Pick a sub-category for this item.');
      return;
    }
    setSubError('');
    updateItem({ ...item, ...form, subCategory: sub } as ClothingItem);
    setEditing(false);
    showToast('Item updated');
  };

  const handleArchiveToggle = () => {
    const nowArchived = !item.archived;
    const label = item.name || item.subCategory;
    setItemsArchived([item.id], nowArchived);
    showToast(
      nowArchived ? `Archived "${label}"` : `Restored "${label}"`,
      { label: 'Undo', onPress: () => setItemsArchived([item.id], !nowArchived) }
    );
    navigation.goBack();
  };

  /**
   * Opens the builder with this item already picked.
   *
   * The seed travels as a route parameter because the Build Outfit screen keeps
   * its own selection state. Writing to the store instead would leave the
   * screen showing nothing selected.
   */
  const handleBuildWith = () => {
    navigation.navigate('OutfitBuilder', { seedItemIds: [item.id] });
  };

  const handleDelete = () => {
    confirm(
      'Delete Item',
      `Permanently delete "${item.name || item.subCategory}"? Archive it instead if you want to keep the record.`,
      () => { deleteItem(item.id); navigation.goBack(); },
      { confirmLabel: 'Delete', destructive: true }
    );
  };

  const itemNumber = wear.numberOf(item.id);
  const wearDates = wear.wearDates(item.id);
  const displayCat = editing ? (form.hierarchyCategory || item.hierarchyCategory) : item.hierarchyCategory;
  const displaySub = editing ? (form.subCategory || item.subCategory) : item.subCategory;
  const seasons: string[] = (form.season as string[]) || item.season || [];

  return (
    <SafeAreaView edges={['top']} style={s.screen} {...panResponder.panHandlers}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={s.page} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
          <View style={s.imageWrap}>
            <TouchableOpacity
              style={s.image}
              onPress={() => item.imageUri && setFullscreen(true)}
              activeOpacity={0.9}
              accessibilityRole="imagebutton"
              accessibilityLabel={item.imageUri ? 'View photo full screen' : 'No photo'}
            >
              {item.imageUri ? (
                <Image
                  source={{ uri: resolveImageUri(editing ? (form.imageUri || item.imageUri) : item.imageUri) }}
                  style={s.image}
                  resizeMode="cover"
                />
              ) : (
                <View style={s.imagePlaceholder}><Ionicons name="image-outline" size={64} color={C.subtle} /></View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={hitSlopFor(40)}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={ICON_SIZE.back} color={C.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.editBtn}
              onPress={() => (editing ? handleSave() : setEditing(true))}
              hitSlop={hitSlopFor(40)}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Save changes' : 'Edit item'}
            >
              <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={ICON_SIZE.header} color={C.primary} />
            </TouchableOpacity>

            {sectionItems.length > 1 && !editing && (
              <View style={[s.pageDots, { pointerEvents: 'none' }]}>
                <Text style={s.pageDotsText}>{activeIndex + 1} of {sectionItems.length}</Text>
              </View>
            )}
          </View>

          <View style={s.body}>
            {editing ? (
              <View style={s.catSection}>
                <Text style={elements.overline}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {hierarchyCats.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => {
                        setSubError('');
                        setForm(f => ({ ...f, hierarchyCategory: c, subCategory: '' }));
                      }}
                      style={[elements.chip, displayCat === c && elements.chipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: displayCat === c }}
                      accessibilityLabel={`Category ${c}`}
                    >
                      <Text style={[elements.chipText, displayCat === c && elements.chipTextSelected]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[elements.overline, { marginTop: 10 }]}>SUB-CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {(subCats[displayCat] || []).map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => { setSubError(''); setForm(f => ({ ...f, subCategory: c })); }}
                      style={[elements.chip, displaySub === c && elements.chipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: displaySub === c }}
                      accessibilityLabel={`Sub-category ${c}`}
                    >
                      <Text style={[elements.chipText, displaySub === c && elements.chipTextSelected]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {(subCats[displayCat] || []).length === 0 && (
                  <Text style={s.hint}>No sub-categories yet for {displayCat}. Add one in Settings.</Text>
                )}
                {!!subError && <Text style={s.error} accessibilityLiveRegion="polite">{subError}</Text>}
              </View>
            ) : (
              <View style={s.headRow}>
                <View style={s.headLeft}>
                  <Text style={s.catTag}>{item.hierarchyCategory} › {item.subCategory}</Text>
                  {item.archived && (
                    <View style={s.archivedPill}><Text style={s.archivedPillText}>ARCHIVED</Text></View>
                  )}
                </View>
                <Text style={s.idLabel}>Item #{itemNumber}</Text>
              </View>
            )}

            <Field label="NAME" editing={editing} value={String(form.name ?? '')}
              display={item.name} onChange={setField('name')} placeholder="e.g. Grey Dress Pants" />
            <Field label="BRAND" editing={editing} value={String(form.brand ?? '')}
              display={item.brand} onChange={setField('brand')} placeholder="e.g. Uniqlo" />
            <Field label="COLOR" editing={editing} value={String(form.color ?? '')}
              display={item.color} onChange={setField('color')} placeholder="e.g. Slate Blue" />
            <Field label="SIZE" editing={editing} value={String(form.size ?? '')}
              display={item.size} onChange={setField('size')} placeholder="e.g. M" />
            <Field label="PRICE" editing={editing} value={String(form.price ?? '')}
              display={formatPrice(item.price)} onChange={setField('price')} placeholder="0" numeric />
            <Field label="LOCATION" editing={editing} value={String(form.location ?? '')}
              display={item.location} onChange={setField('location')} placeholder="e.g. Cloakroom" />

            <View style={[s.fieldRow, { flexDirection: 'column', gap: 6, alignItems: 'stretch' }]}>
              <Text style={elements.overline}>DESCRIPTION</Text>
              {editing ? (
                <TextInput
                  style={[s.fieldInput, s.descInput]}
                  multiline
                  textAlignVertical="top"
                  value={String(form.description ?? '')}
                  onChangeText={setField('description')}
                  placeholderTextColor={C.secondary}
                  placeholder="Description..."
                  accessibilityLabel="Description"
                />
              ) : (
                <Text style={[s.fieldValue, { lineHeight: 20, textAlign: 'left' }]}>{item.description || '—'}</Text>
              )}
            </View>

            {editing && (
              <View style={s.catSection}>
                <Text style={elements.overline}>SEASON</Text>
                <View style={s.seasonWrap}>
                  {SEASONS.map(season => {
                    const active = seasons.includes(season);
                    return (
                      <TouchableOpacity
                        key={season}
                        onPress={() => setForm(f => ({
                          ...f,
                          season: active ? seasons.filter(x => x !== season) : [...seasons, season],
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
            )}

            {!editing && (
              <View style={s.historySection}>
                <Text style={elements.overline}>WEAR HISTORY ({wearDates.length})</Text>
                {wearDates.length > 0 ? (
                  <View style={s.dateGrid}>
                    {wearDates.map((ms, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={s.dateChip}
                        onPress={() => navigation.navigate('Calendar', {
                          screen: 'CalendarMain',
                          params: { selectedDate: new Date(ms).toISOString() },
                        })}
                        accessibilityRole="button"
                        accessibilityLabel={`Worn on ${formatDateWithWeekday(ms, 'long')}. Open in calendar.`}
                      >
                        <Text style={s.dateText}>{formatDateWithWeekday(ms)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={s.emptyHistory}>No wear records found.</Text>
                )}
              </View>
            )}

            <View style={s.actions}>
              {editing && (
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { setForm(item); setEditing(false); }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
              )}

              {!editing && !item.archived && (
                <TouchableOpacity
                  style={s.buildBtn}
                  onPress={handleBuildWith}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Start an outfit with ${item.name || item.subCategory}`}
                >
                  <Ionicons name="shirt-outline" size={20} color={C.main} />
                  <Text style={s.buildText}>Build Outfit With This</Text>
                </TouchableOpacity>
              )}

              {!editing && (
                <TouchableOpacity
                  style={s.archiveBtn}
                  onPress={handleArchiveToggle}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.archived ? 'Restore to closet' : 'Archive item'}
                >
                  <Ionicons name={item.archived ? 'refresh-outline' : 'archive-outline'} size={20} color={C.accent} />
                  <Text style={s.archiveText}>{item.archived ? 'Restore to Closet' : 'Archive Item'}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={s.deleteBtn}
                onPress={handleDelete}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Delete item permanently"
              >
                <Ionicons name="trash-outline" size={20} color={C.danger} />
                <Text style={s.deleteText}>Delete Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={s.fullModal}>
          <TouchableOpacity
            style={s.fullModalClose}
            onPress={() => setFullscreen(false)}
            hitSlop={hitSlopFor(32)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={32} color={C.onPhoto} />
          </TouchableOpacity>
          <ZoomableImage uri={resolveImageUri(item.imageUri)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  page: { width: '100%', flex: 1, backgroundColor: C.main },
  pageContent: { paddingBottom: 24, backgroundColor: C.main },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  notFoundText: { color: C.secondary, fontSize: T.body, textAlign: 'center' },
  imageWrap: { height: 280, backgroundColor: C.surface, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 12, left: 12, backgroundColor: C.photoScrim, borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  editBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: C.photoScrim, borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  pageDots: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: C.photoScrim, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pageDotsText: { color: C.onPhoto, fontSize: T.micro, fontWeight: '700' },
  body: { padding: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  catTag: { color: C.accent, fontWeight: '700', fontSize: T.footnote },
  archivedPill: { backgroundColor: C.accentTint, borderColor: C.accent, borderWidth: 1, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 },
  archivedPillText: { color: C.accent, fontSize: T.micro, fontWeight: '800' },
  idLabel: { color: C.secondary, fontSize: T.footnote, fontWeight: '700' },
  catSection: { marginBottom: 16 },
  hint: { color: C.secondary, fontSize: T.caption, marginTop: 6 },
  error: { color: C.danger, fontSize: T.caption, fontWeight: '600', marginTop: 6 },
  chipRow: { gap: 8, marginTop: 6, paddingRight: 8 },
  seasonWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.subtle, paddingVertical: 14, gap: 12 },
  fieldValue: { color: C.primary, fontSize: T.body, flexShrink: 1, textAlign: 'right' },
  fieldInput: { color: C.primary, fontSize: T.body, backgroundColor: C.surface, borderRadius: R.control, padding: 10, borderWidth: 1, borderColor: C.subtle, flex: 1, maxWidth: 200, textAlign: 'right' },
  descInput: { height: 100, maxWidth: undefined, textAlign: 'left' },
  actions: { marginTop: 32, gap: 12 },
  cancelBtn: { padding: 16, borderRadius: R.control, borderWidth: 1, borderColor: C.subtle, alignItems: 'center' },
  cancelText: { color: C.primary, fontWeight: '700', fontSize: T.body },
  buildBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: R.control, backgroundColor: C.accent },
  buildText: { color: C.main, fontWeight: '700', fontSize: T.body },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: R.control, borderWidth: 1, borderColor: C.accent },
  archiveText: { color: C.accent, fontWeight: '700', fontSize: T.body },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: R.control, borderWidth: 1, borderColor: C.danger },
  deleteText: { color: C.danger, fontWeight: '700', fontSize: T.body },
  historySection: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: C.subtle },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  dateChip: { backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.subtle },
  dateText: { color: C.primary, fontSize: T.footnote },
  emptyHistory: { color: C.secondary, fontSize: T.footnote, marginTop: 12, fontStyle: 'italic' },
  fullModal: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullModalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8 },
});
