import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../store/useStore';
import { parseBulkItems, parseBulkOutfits, exportItemsToText, exportOutfitsToText } from '../utils/parsers';
import { saveImageLocally } from '../utils/media';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { confirm } from '../utils/confirm';
import { showToast } from '../store/useToast';
import { plural } from '../utils/format';
import { useWearIndex } from '../hooks/useWearIndex';
import {
  findMissingPhotos, repairMissingPhotos, photoRepairSummary,
  isPhotoRepairSupported, type PhotoRepairProgress,
} from '../utils/photoRepair';
import { C, R, T } from '../theme';
import { elements } from '../elementStyles';

type SettingRowProps = { icon: string; label: string; sub?: string; onPress: () => void; dangerous?: boolean };
const SettingRow = ({ icon, label, sub, onPress, dangerous }: SettingRowProps) => (
  <TouchableOpacity
    onPress={onPress}
    style={s.row}
    accessibilityRole="button"
    accessibilityLabel={sub ? `${label}. ${sub}` : label}
  >
    <View style={[s.rowIcon, { backgroundColor: dangerous ? C.danger + '22' : C.accentTint }]}>
      {/* @ts-ignore */}
      <Ionicons name={icon} size={20} color={dangerous ? C.danger : C.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[s.rowLabel, dangerous && { color: C.danger }]}>{label}</Text>
      {sub && <Text style={s.rowSub}>{sub}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={16} color={C.subtle} />
  </TouchableOpacity>
);

/** Which kind of text the paste sheet accepts right now. */
type PasteMode = 'items' | 'history' | 'jsonCloset' | 'jsonHistory' | null;

const PASTE_COPY: Record<Exclude<PasteMode, null>, { title: string; hint: string; example: string; placeholder: string }> = {
  items: {
    title: 'Import Item Descriptions',
    hint: 'Two lines per item, and a blank line between items.\nLine 1: sub-category name. Line 2 and after: description.',
    example: 'T-shirt\nA plain white cotton slim-fit tee\n\nDress Pants\nGrey slim-cut trousers, single button',
    placeholder: 'Paste your item list here...',
  },
  history: {
    title: 'Import Outfit History',
    hint: 'One line per date. Format: M/D and then the item numbers.\nUse the numbers that the app shows on each item, such as #1.',
    example: '4/8 1 3\n3/15 2 5 7\n1/1 1 2 8',
    placeholder: 'Paste your history here...',
  },
  jsonCloset: {
    title: 'Import Closet (JSON)',
    hint: 'Paste a JSON array of items. The app adds them to your closet.',
    example: '[ { "id": "...", "name": "T-shirt", ... } ]',
    placeholder: 'Paste JSON here...',
  },
  jsonHistory: {
    title: 'Import History (JSON)',
    hint: 'Paste a JSON array of outfits. The app adds them to your history.',
    example: '[ { "id": "...", "dateWorn": "...", "itemIds": [...] } ]',
    placeholder: 'Paste JSON here...',
  },
};

/**
 * Tells the user what the import did. An import can drop a record two ways:
 * the parser did not know a line, or the record is already in the closet.
 */
const importMessage = (
  res: { added: number; duplicates: number; highestNumber: number },
  skipped: string[],
) => {
  const parts = [`Imported ${plural(res.added)}`];
  if (res.highestNumber) parts[0] += `, numbered up to #${res.highestNumber}`;
  if (res.duplicates) parts.push(`${res.duplicates} already in your closet`);
  if (skipped.length) parts.push(`${plural(skipped.length, 'line')} skipped, such as "${skipped[0]}"`);
  return parts.join(' · ');
};

const outfitImportMessage = (res: { added: number; duplicates: number }) => {
  const parts = [`Imported ${plural(res.added, 'outfit record')}`];
  if (res.duplicates) parts.push(`${res.duplicates} already in your history`);
  return parts.join(' · ');
};

export default function SettingsScreen() {
  const {
    clothingItems, outfits, bulkImportItems, bulkImportOutfits, updateItem,
    categoryMap, deduplicateCloset,
  } = useStore();

  const wear = useWearIndex();

  const [pasteMode, setPasteMode] = useState<PasteMode>(null);
  const [pasteText, setPasteText] = useState('');

  const [exportModal, setExportModal] = useState(false);
  const [exportText, setExportText] = useState('');
  const [exportTitle, setExportTitle] = useState('');

  const totalItems = clothingItems.length;
  const totalOutfits = outfits.length;

  /** Counts exact duplicates with the same key that the store uses. */
  const duplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let dupes = 0;
    clothingItems.forEach(item => {
      const key = `${item.hierarchyCategory}|${item.subCategory}|${item.description || ''}|${item.brand || ''}|${item.color || ''}`;
      if (seen.has(key)) dupes += 1;
      else seen.add(key);
    });
    return dupes;
  }, [clothingItems]);

  const [repairProgress, setRepairProgress] = useState<PhotoRepairProgress | null>(null);

  /** Runs the photo repair again, including photos the start-up run already tried. */
  const handleRepairPhotos = async () => {
    const missing = findMissingPhotos(true);
    if (missing.length === 0) {
      showToast('Every photo is in place');
      return;
    }
    setRepairProgress({ done: 0, total: missing.length });
    try {
      const result = await repairMissingPhotos(missing, setRepairProgress);
      const restored = result.missingCount - result.stillMissingCount;
      // An image that failed once does not reload by itself, and Home stays
      // mounted, so a restart is the honest instruction.
      showToast(photoRepairSummary(result) + (restored > 0 ? ' Reopen the app to see them.' : ''));
    } catch (e: any) {
      showToast(`Photo repair stopped: ${e?.message ?? e}`);
    } finally {
      setRepairProgress(null);
    }
  };

  const handleDedup = () => {
    if (duplicateCount === 0) {
      showToast('No duplicates found');
      return;
    }
    confirm(
      'De-Duplicate Closet',
      `Remove ${duplicateCount} duplicate item${duplicateCount === 1 ? '' : 's'} from your closet? You cannot undo this.`,
      () => {
        deduplicateCloset();
        showToast(`Removed ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`);
      },
      { confirmLabel: 'Clean Up', destructive: true }
    );
  };

  const handleCheckForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        confirm('Update Available', 'A new update is ready. Download it and restart the app?',
          async () => {
            showToast('Downloading the update...');
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          },
          { confirmLabel: 'Update' });
      } else {
        showToast('You have the latest version');
      }
    } catch {
      showToast('OTA updates only work in the built app, not in Expo Go');
    }
  };

  // ── Paste sheet ───────────────────────────────────────────────
  const openPaste = (mode: Exclude<PasteMode, null>) => {
    setPasteText('');
    setPasteMode(mode);
  };

  const closePaste = () => {
    setPasteMode(null);
    setPasteText('');
  };

  const handlePasteImport = () => {
    if (!pasteMode) return;
    const text = pasteText.trim();
    if (!text) { showToast('Paste something first'); return; }

    try {
      if (pasteMode === 'items') {
        const { items, skipped } = parseBulkItems(text, categoryMap);
        if (items.length === 0) {
          showToast(skipped.length
            ? `No known sub-category in that text. "${skipped[0]}" is not one yet.`
            : 'Nothing to import. Check the format.');
          return;
        }
        const res = bulkImportItems(items);
        showToast(importMessage(res, skipped));
      } else if (pasteMode === 'history') {
        const parsed = parseBulkOutfits(text, clothingItems);
        if (parsed.length === 0) { showToast('Nothing to import. Check the format.'); return; }
        const res = bulkImportOutfits(parsed);
        showToast(outfitImportMessage(res));
      } else {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) { showToast('The JSON must be an array'); return; }
        if (pasteMode === 'jsonCloset') {
          showToast(importMessage(bulkImportItems(parsed), []));
        } else {
          showToast(outfitImportMessage(bulkImportOutfits(parsed)));
        }
      }
      closePaste();
    } catch {
      showToast('The app could not read that text. Check the format.');
    }
  };

  // ── Photo import (matched to item order) ──────────────────────
  const handlePhotoImport = async () => {
    if (clothingItems.length === 0) {
      showToast('Import your item descriptions first');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showToast('Allow photo access in your device settings'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      orderedSelection: true, // keeps the order of the selection
    });

    if (result.canceled) return;

    const photos = result.assets;
    const count = Math.min(photos.length, clothingItems.length);

    for (let i = 0; i < count; i++) {
      const item = clothingItems[i]; // item #(i+1)
      const photo = photos[i];       // photo #(i+1), oldest first
      const permanentUri = await saveImageLocally(photo.uri);
      updateItem({ ...item, imageUri: permanentUri, originalGalleryUri: photo.uri });
    }

    showToast(`Assigned ${plural(count, 'photo')} to items #1 to #${count}`);
  };

  // ── Export ────────────────────────────────────────────────────
  const openExport = (title: string, text: string) => {
    setExportTitle(title);
    setExportText(text);
    setExportModal(true);
  };

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(exportText);
    setExportModal(false);
    showToast('Copied to the clipboard');
  };

  const paste = pasteMode ? PASTE_COPY[pasteMode] : null;

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={elements.screenHeader}>
        <Text style={elements.screenTitle} accessibilityRole="header">Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Stats summary */}
        <View style={s.statsRow}>
          <View style={s.statCard}><Text style={s.statNum}>{totalItems}</Text><Text style={s.statLabel}>Items</Text></View>
          <View style={s.statCard}><Text style={s.statNum}>{totalOutfits}</Text><Text style={s.statLabel}>Logged Outfits</Text></View>
        </View>

        {/* Sharing used to live here. It moved to the link button in the Closet
            header, next to the clothes the link actually publishes. */}

        {/* ── Import Section ─────────────────────── */}
        <Text style={[elements.overline, s.sectionHeader]}>IMPORT DATA</Text>
        <View style={s.card}>
          <SettingRow
            icon="document-text-outline"
            label="Import Item Descriptions"
            sub="Paste a list of sub-category and description blocks"
            onPress={() => openPaste('items')}
          />
          <View style={s.divider} />
          <SettingRow
            icon="images-outline"
            label="Import Photos"
            sub={`Select ${totalItems > 0 ? `up to ${totalItems}` : 'photos'} — the first selection becomes item #1`}
            onPress={handlePhotoImport}
          />
          <View style={s.divider} />
          <SettingRow
            icon="calendar-outline"
            label="Import Outfit History"
            sub="Paste date and item number records, such as 4/8 1 3"
            onPress={() => openPaste('history')}
          />
          <View style={s.divider} />
          <SettingRow
            icon="code-working-outline"
            label="Import Closet (JSON)"
            sub="Paste a JSON array of items"
            onPress={() => openPaste('jsonCloset')}
          />
          <View style={s.divider} />
          <SettingRow
            icon="code-working-outline"
            label="Import History (JSON)"
            sub="Paste a JSON array of outfits"
            onPress={() => openPaste('jsonHistory')}
          />
        </View>

        {/* ── Export Section ────────────────────── */}
        <Text style={[elements.overline, s.sectionHeader]}>EXPORT DATA</Text>
        <View style={s.card}>
          <SettingRow
            icon="share-outline"
            label="Export Wardrobe (Text)"
            sub="Make a text copy for backup or sharing"
            onPress={() => openExport('Wardrobe', exportItemsToText(clothingItems))}
          />
          <View style={s.divider} />
          <SettingRow
            icon="share-outline"
            label="Export Outfit History (Text)"
            sub="Make a text copy of the history log"
            onPress={() => openExport('Outfit History', exportOutfitsToText(outfits, clothingItems))}
          />
          <View style={s.divider} />
          <SettingRow
            icon="copy-outline"
            label="Export Closet (JSON)"
            sub="Make a JSON copy for backup or migration"
            onPress={() => openExport('Closet (JSON)', JSON.stringify(clothingItems, null, 2))}
          />
          <View style={s.divider} />
          <SettingRow
            icon="copy-outline"
            label="Export History (JSON)"
            sub="Make a JSON copy for backup or migration"
            onPress={() => openExport('History (JSON)', JSON.stringify(outfits, null, 2))}
          />
        </View>

        <Text style={[elements.overline, s.sectionHeader]}>SYSTEM</Text>
        <View style={s.card}>
          <SettingRow
            icon="trash-outline"
            dangerous
            label="De-Duplicate Closet"
            sub={duplicateCount > 0
              ? `${duplicateCount} exact duplicate${duplicateCount === 1 ? '' : 's'} found`
              : 'No duplicates found'}
            onPress={handleDedup}
          />
          <View style={s.divider} />
          <SettingRow
            icon="cloud-download-outline"
            label="Check for Updates"
            sub="Look for over-the-air improvements now"
            onPress={handleCheckForUpdates}
          />
          {isPhotoRepairSupported && (
            <>
              <View style={s.divider} />
              <SettingRow
                icon="images-outline"
                    label={repairProgress ? 'Restoring Photos...' : 'Restore Missing Photos'}
                sub={repairProgress
                  ? `${repairProgress.done} of ${repairProgress.total}`
                  : 'Looks in the old Expo Go folder and your share link'}
                onPress={repairProgress ? () => { } : handleRepairPhotos}
              />
            </>
          )}
        </View>

        <Text style={[elements.overline, s.sectionHeader]}>ITEM NUMBERING</Text>
        <View style={s.card}>
          <View style={{ padding: 16 }}>
            <Text style={s.infoText}>
              Items keep the number that they get at import.{'\n'}
              The first item is <Text style={{ color: C.primary }}>Item #1</Text>, the second is <Text style={{ color: C.primary }}>Item #2</Text>, and so on.
              A number stays with an item even after you delete or archive another one.{'\n\n'}
              Use these numbers when you number photos or log outfit history.
            </Text>
            {totalItems > 0 && (
              <View style={s.itemNumberList}>
                {clothingItems.slice(0, 8).map(item => (
                  <View key={item.id} style={s.itemNumberRow}>
                    <Text style={s.itemNumberBadge}>#{wear.numberOf(item.id)}</Text>
                    <Text style={s.itemNumberSub}>{item.subCategory || 'Unknown'}</Text>
                  </View>
                ))}
                {clothingItems.length > 8 && <Text style={s.itemNumberMore}>+ {clothingItems.length - 8} more...</Text>}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Paste sheet (one sheet for all four import kinds) ─── */}
      <Modal visible={!!pasteMode} animationType="slide" transparent onRequestClose={closePaste}>
        <View style={elements.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePaste} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[elements.sheet, s.modalSheet]}>
              <View style={elements.grabber} />
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={elements.sheetHeading}>
                  <Text style={elements.sheetTitle} accessibilityRole="header">{paste?.title}</Text>
                  <Text style={elements.sheetHint}>{paste?.hint}</Text>
                </View>
                <View style={s.exampleBox}>
                  <Text style={s.exampleText}>{paste?.example}</Text>
                </View>
                <TextInput
                  style={[elements.textInput, s.textArea]}
                  multiline
                  textAlignVertical="top"
                  placeholderTextColor={C.secondary}
                  placeholder={paste?.placeholder}
                  value={pasteText}
                  onChangeText={setPasteText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={paste ? `${paste.title}. ${paste.placeholder}` : 'Paste box'}
                  accessibilityHint={paste?.hint}
                />
                <View style={elements.buttonRow}>
                  <TouchableOpacity style={elements.outlineButton} onPress={closePaste} accessibilityRole="button">
                    <Text style={elements.outlineButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={elements.filledButton} onPress={handlePasteImport} accessibilityRole="button">
                    <Text style={elements.filledButtonText}>Import</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Export Modal ─────────────────────────────────── */}
      <Modal visible={exportModal} animationType="slide" transparent onRequestClose={() => setExportModal(false)}>
        <View style={elements.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setExportModal(false)} accessibilityLabel="Close" />
          <View style={[elements.sheet, s.modalSheet]}>
            <View style={elements.grabber} />
            <View style={elements.sheetHeading}>
              <Text style={elements.sheetTitle} accessibilityRole="header">Export: {exportTitle}</Text>
              <Text style={elements.sheetHint}>Copy this text, keep it somewhere safe, and paste it back later to import.</Text>
            </View>
            <TextInput
              style={[elements.textInput, s.textArea]}
              multiline
              editable={false}
              value={exportText}
              accessibilityLabel={`Exported ${exportTitle}`}
            />
            <View style={elements.buttonRow}>
              <TouchableOpacity style={elements.outlineButton} onPress={() => setExportModal(false)} accessibilityRole="button">
                <Text style={elements.outlineButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={elements.filledButton} onPress={copyToClipboard} accessibilityRole="button" accessibilityLabel="Copy and close">
                <Ionicons name="copy-outline" size={18} color={C.main} />
                <Text style={elements.filledButtonText}>Copy & Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: C.surface, borderRadius: R.tile, borderWidth: 1, borderColor: C.subtle, padding: 16, alignItems: 'center' },
  statNum: { color: C.accent, fontSize: T.title, fontWeight: '900' },
  statLabel: { color: C.secondary, fontSize: T.micro, marginTop: 4 },
  sectionHeader: { marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: C.surface, borderRadius: R.tile, borderWidth: 1, borderColor: C.subtle, marginBottom: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, minHeight: 60 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: C.primary, fontSize: T.body, fontWeight: '600' },
  rowSub: { color: C.secondary, fontSize: T.caption, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.subtle, marginLeft: 66 },
  infoText: { color: C.secondary, fontSize: T.footnote, lineHeight: 20 },
  itemNumberList: { marginTop: 12, gap: 6 },
  itemNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemNumberBadge: { color: C.accent, fontWeight: '800', fontSize: T.footnote, width: 36 },
  itemNumberSub: { color: C.secondary, fontSize: T.footnote },
  itemNumberMore: { color: C.secondary, fontSize: T.caption, marginTop: 4 },
  modalSheet: { maxHeight: '88%' },
  exampleBox: { backgroundColor: C.main, borderRadius: R.control, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.subtle },
  exampleText: { color: C.accent, fontFamily: 'monospace', fontSize: T.caption },
  textArea: { height: 160, marginBottom: 8 },
});
